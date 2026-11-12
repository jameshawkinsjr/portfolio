#!/usr/bin/env node
// Checks the generated variants in templates/ against index.html.
//
// Static checks (always):
//   - content/profile.json passes scripts/check-content.mjs
//   - index.html is up to date with content/ and site/ (scripts/build-site.mjs)
//   - each variant's <body> equals the shared renderBody() markup (img paths
//     rebased) and its visible text equals the live index.html's, ignoring <title>
//   - noindex + canonical present; no gtag / googletagmanager / JSON-LD
//   - every local src/href resolves to a file on disk (works from file://)
// Browser checks (skipped with --static; needs Google Chrome, or set CHROME):
//   - loads each page over file:// at 1280px and 390px with reduced motion
//   - horizontal overflow, broken images, console errors / failed requests,
//     web fonts that failed to load, letters injected via ::before/::after,
//     and WCAG AA text contrast on solid backgrounds
//   - full-page screenshots to templates/_screenshots/ (git-ignored)
//
// Usage: node scripts/check-variants.mjs [--static] [slug ...]
// Exits 1 if any check fails.

import { readFileSync, existsSync, mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { variants } from './variants.mjs';
import { variantBody } from './build-variants.mjs';
import { renderSite } from './build-site.mjs';
import { checkContent } from './check-content.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const staticOnly = args.includes('--static');
const only = args.filter((a) => !a.startsWith('--'));
const selected = variants.filter((v) => !only.length || only.includes(v.slug));
const failures = [];
const fail = (slug, msg) => failures.push(`${slug}: ${msg}`);

// ─── static ───
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', mdash: '—', ndash: '–', middot: '·', rsquo: '’', lsquo: '‘' };
function visibleText(html) {
  const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [])[1] || '';
  return body
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

for (const p of checkContent()) failures.push(`content: ${p}`);
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');
if (indexHtml !== renderSite()) failures.push('index.html: out of date with content/ or site/ (run node scripts/build-site.mjs)');
// Visible text of the live page, minus the script bodies.
const indexText = visibleText(indexHtml);
const indexBody = variantBody();

for (const v of selected) {
  const file = join(root, 'templates', v.slug, 'index.html');
  if (!existsSync(file)) { fail(v.slug, 'not built (run node scripts/build-variants.mjs)'); continue; }
  const html = readFileSync(file, 'utf8');
  const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [])[1];
  if (body !== indexBody) fail(v.slug, 'body markup differs from the shared renderBody() output — rebuild');
  const text = visibleText(html);
  if (text !== indexText) {
    let i = 0;
    while (i < text.length && text[i] === indexText[i]) i++;
    fail(v.slug, `visible text differs from index.html at char ${i}: "${text.slice(i, i + 60)}" vs "${indexText.slice(i, i + 60)}"`);
  }
  if (!/<meta name="robots" content="noindex, nofollow"/.test(html)) fail(v.slug, 'missing noindex');
  if (!/<link rel="canonical" href="https:\/\/jameshawkins\.com\/"/.test(html)) fail(v.slug, 'missing canonical');
  if (/gtag|googletagmanager/i.test(html)) fail(v.slug, 'contains the GA4 tag');
  if (/application\/ld\+json/i.test(html)) fail(v.slug, 'contains JSON-LD');
  if (!/<title>James Hawkins — .+ variant<\/title>/.test(html)) fail(v.slug, 'unexpected <title>');
  for (const [, url] of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|#|data:)/.test(url)) continue;
    if (url.startsWith('/')) { fail(v.slug, `root-absolute path ${url} breaks on file://`); continue; }
    const target = resolve(dirname(file), url.split('#')[0]);
    if (!existsSync(target)) fail(v.slug, `missing local file ${url}`);
  }
}
const galleryFile = join(root, 'templates', 'index.html');
if (!existsSync(galleryFile)) failures.push('gallery: templates/index.html not built');
else {
  const g = readFileSync(galleryFile, 'utf8');
  for (const v of variants) if (!g.includes(`href="${v.slug}/index.html"`)) failures.push(`gallery: no link to ${v.slug}`);
}
console.log(`static: checked ${selected.length} variants`);

// ─── browser ───
if (!staticOnly) await browserChecks();

if (failures.length) {
  console.error(`\n${failures.length} problem(s):\n` + failures.map((f) => '  ✗ ' + f).join('\n'));
  process.exit(1);
}
console.log('\nall checks passed');

async function browserChecks() {
  const chrome = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (!existsSync(chrome)) { failures.push(`browser: Chrome not found at ${chrome} (set CHROME or pass --static)`); return; }
  const profile = mkdtempSync(join(tmpdir(), 'check-variants-'));
  const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--allow-file-access-from-files', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    const t = setTimeout(() => rej(new Error('Chrome did not start')), 20000);
    proc.stderr.on('data', (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); res(m[1]); }
    });
  });
  const shots = join(root, 'templates', '_screenshots');
  mkdirSync(shots, { recursive: true });
  const cdp = await connect(wsUrl);
  try {
    for (const v of selected) {
      for (const width of [1280, 390]) await checkPage(cdp, v, width, shots);
    }
    console.log(`browser: checked ${selected.length} variants at 1280px and 390px; screenshots in templates/_screenshots/`);
  } finally {
    cdp.close();
    proc.kill();
    await new Promise((r) => setTimeout(r, 300));
    rmSync(profile, { recursive: true, force: true });
  }
}

async function connect(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
    } else listeners.forEach((l) => l(msg));
  };
  return {
    send: (method, params = {}, sessionId) => new Promise((res, rej) => {
      const mid = ++id;
      pending.set(mid, { res, rej });
      ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
    }),
    on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    close: () => ws.close(),
  };
}

async function checkPage(cdp, v, width, shots) {
  const tag = `${v.slug}@${width}`;
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (m, p) => cdp.send(m, p, sessionId);
  const errors = [];
  let loaded;
  const loadedP = new Promise((r) => (loaded = r));
  const off = cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push(`${msg.params.entry.text} ${msg.params.entry.url || ''}`.trim());
    if (msg.method === 'Page.loadEventFired') loaded();
  });
  try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Emulation.setDeviceMetricsOverride', { width, height: width > 500 ? 900 : 844, deviceScaleFactor: 1, mobile: width <= 500 });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const url = pathToFileURL(join(root, 'templates', v.slug, 'index.html')).href;
    await send('Page.navigate', { url });
    await Promise.race([loadedP, new Promise((r) => setTimeout(r, 15000))]);
    const { result } = await send('Runtime.evaluate', { expression: `(${pageAudit})()`, awaitPromise: true, returnByValue: true });
    const r = result.value;
    if (!r) throw new Error('audit returned nothing');
    if (r.overflow > 0) fail(tag, `horizontal overflow of ${r.overflow}px (widest: ${r.widest.join(', ')})`);
    for (const img of r.brokenImages) fail(tag, `broken image ${img}`);
    for (const f of r.failedFonts) fail(tag, `web font failed to load: ${f}`);
    for (const p of r.pseudoText) fail(tag, `pseudo-element adds text: ${p}`);
    for (const c of r.contrast) fail(tag, `low contrast ${c}`);
    for (const e of errors) fail(tag, `console: ${e}`);
    const metrics = await send('Page.getLayoutMetrics');
    const h = Math.ceil(metrics.cssContentSize.height);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: h, scale: 1 } });
    writeFileSync(join(shots, `${v.slug}-${width}.png`), Buffer.from(shot.data, 'base64'));
  } catch (e) {
    fail(tag, `browser check crashed: ${e.message}`);
  } finally {
    off();
    await cdp.send('Target.closeTarget', { targetId }).catch(() => {});
  }
}

// Runs inside the page.
async function pageAudit() {
  await document.fonts.ready;
  // Load lazy images so they can be checked.
  const imgs = [...document.images];
  imgs.forEach((i) => (i.loading = 'eager'));
  await Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 5000); }))));
  await new Promise((r) => setTimeout(r, 200));

  const docW = document.documentElement.clientWidth;
  const overflow = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - docW;
  const widest = overflow > 0
    ? [...document.querySelectorAll('body *')].filter((el) => el.getBoundingClientRect().right > docW + 1).slice(0, 4).map((el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''))
    : [];
  const brokenImages = imgs.filter((i) => !i.naturalWidth).map((i) => i.getAttribute('src'));
  const failedFonts = [...document.fonts].filter((f) => f.status === 'error').map((f) => `${f.family} ${f.weight}`);

  const pseudoText = [];
  for (const el of document.querySelectorAll('body *')) {
    for (const p of ['::before', '::after']) {
      const c = getComputedStyle(el, p).content;
      if (c && c !== 'none' && c !== 'normal' && /[\p{L}\p{N}]/u.test(c.replace(/\\[0-9a-f]+/gi, '').replace(/^"|"$/g, '').replace(/attr\(.*\)|counter\(.*\)/g, ''))) pseudoText.push(`${el.tagName.toLowerCase()}.${el.className}${p} ${c}`);
    }
  }

  const parse = (s) => {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return [r, g, b, a];
  };
  const blend = (top, under) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
  };
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  // Effective background: blend solid layers up the tree; give up on images/gradients.
  const bgOf = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage !== 'none') return null;
      // A decorative ::before/::after background (e.g. a gradient band) may sit behind the text.
      if (n !== el && ['::before', '::after'].some((p) => { const ps = getComputedStyle(n, p); return ps.content !== 'none' && ps.backgroundImage !== 'none'; })) return null;
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let out = [255, 255, 255, 1];
    for (const l of layers.reverse()) out = blend(l, out);
    return out;
  };
  const contrast = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    if (!t.textContent.trim()) continue;
    const el = t.parentElement;
    if (!el || el.closest('script,style,[aria-hidden="true"]')) continue;
    const cs = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    if (cs.visibility === 'hidden' || cs.display === 'none' || !rect.width || !rect.height) continue;
    let op = 1;
    for (let n = el; n; n = n.parentElement) op *= +getComputedStyle(n).opacity;
    const bg = bgOf(el);
    const fg0 = parse(cs.color);
    if (!bg || !fg0) continue;
    const fg = blend([fg0[0], fg0[1], fg0[2], fg0[3] * op], bg);
    const [L1, L2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    const ratio = (L1 + 0.05) / (L2 + 0.05);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need) {
      const key = `${el.tagName}.${el.className}`;
      if (seen.has(key)) continue;
      seen.add(key);
      contrast.push(`${ratio.toFixed(2)}:1 (needs ${need}) on ${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''} "${t.textContent.trim().slice(0, 30)}"`);
    }
  }
  return { overflow, widest, brokenImages, failedFonts, pseudoText, contrast };
}
