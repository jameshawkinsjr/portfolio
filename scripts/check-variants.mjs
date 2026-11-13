#!/usr/bin/env node
// Checks the generated live page, theme stylesheets and variants in templates/.
//
// Static checks (always):
//   - content/profile.json passes scripts/check-content.mjs
//   - index.html is up to date with content/ and site/ (scripts/build-site.mjs),
//     and themes/*.css + themes/themes.json with templates/ (build-variants.mjs)
//   - each variant's <body> equals the shared renderBody() markup (img paths
//     rebased) and its visible text equals the live index.html's, ignoring <title>
//   - noindex + canonical present; no gtag / googletagmanager / JSON-LD
//   - every local src/href resolves to a file on disk (works from file://)
// Browser checks (skipped with --static; needs Google Chrome, or set CHROME).
//   The homepage is loaded with the default and every ?theme=, and the Theme
//   dropdown is driven (choose, reload, switch twice, while scrolled, back to
//   default, invalid values). For every page:
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
import { variantBody, themeCss, themeManifest } from './build-variants.mjs';
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
for (const v of selected) {
  const f = join(root, 'themes', `${v.slug}.css`);
  if (!existsSync(f) || readFileSync(f, 'utf8') !== themeCss(v)) fail(v.slug, `themes/${v.slug}.css is missing or stale — rebuild`);
}
const manifest = join(root, 'themes', 'themes.json');
if (!existsSync(manifest) || readFileSync(manifest, 'utf8') !== themeManifest()) failures.push('themes/themes.json is missing or stale — rebuild');
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
    console.log(`browser: checked ${selected.length} variants at 1280px and 390px`);
    await homepageChecks(cdp, shots);
    console.log(`browser: checked the homepage with the default and ${selected.length} themes at 1280px and 390px, and the Theme dropdown; screenshots in templates/_screenshots/`);
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

// Opens a fresh tab and collects console errors and requested URLs.
async function openTab(cdp, { width = 1280, reducedMotion = true } = {}) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const send = (m, p) => cdp.send(m, p, sessionId);
  const tab = { send, errors: [], requests: [] };
  let loaded = () => {};
  const off = cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') tab.errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') tab.errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') tab.errors.push(`${msg.params.entry.text} ${msg.params.entry.url || ''}`.trim());
    if (msg.method === 'Network.requestWillBeSent') tab.requests.push(msg.params.request.url);
    if (msg.method === 'Page.loadEventFired') loaded();
  });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height: width > 500 ? 900 : 844, deviceScaleFactor: 1, mobile: width <= 500 });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }] });
  tab.goto = async (url) => {
    tab.errors.length = 0;
    tab.requests.length = 0;
    const p = new Promise((r) => (loaded = r));
    await send('Page.navigate', { url });
    await Promise.race([p, new Promise((r) => setTimeout(r, 15000))]);
  };
  tab.eval = async (fnOrExpr, ...args) => {
    const expression = typeof fnOrExpr === 'function' ? `(${fnOrExpr})(...${JSON.stringify(args)})` : fnOrExpr;
    const { result, exceptionDetails } = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || exceptionDetails.text);
    return result.value;
  };
  tab.waitFor = async (fn, ms = 10000, ...args) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await tab.eval(fn, ...args)) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  };
  tab.audit = async (tag, { contrast = true } = {}) => {
    const r = await tab.eval(pageAudit);
    if (!r) throw new Error('audit returned nothing');
    if (r.overflow > 0) fail(tag, `horizontal overflow of ${r.overflow}px (widest: ${r.widest.join(', ')})`);
    for (const img of r.brokenImages) fail(tag, `broken image ${img}`);
    for (const f of r.failedFonts) fail(tag, `web font failed to load: ${f}`);
    for (const p of r.pseudoText) fail(tag, `pseudo-element adds text: ${p}`);
    if (contrast) for (const c of r.contrast) fail(tag, `low contrast ${c}`);
    for (const e of tab.errors) fail(tag, `console: ${e}`);
  };
  tab.shoot = async (file, fullPage = true) => {
    let clip;
    if (fullPage) {
      const metrics = await send('Page.getLayoutMetrics');
      clip = { x: 0, y: 0, width, height: Math.ceil(metrics.cssContentSize.height), scale: 1 };
    }
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullPage, ...(clip ? { clip } : {}) });
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
  };
  tab.close = async () => { off(); await cdp.send('Target.closeTarget', { targetId }).catch(() => {}); };
  return tab;
}

async function checkPage(cdp, v, width, shots) {
  const tag = `${v.slug}@${width}`;
  const tab = await openTab(cdp, { width });
  try {
    await tab.goto(pathToFileURL(join(root, 'templates', v.slug, 'index.html')).href);
    await tab.audit(tag);
    await tab.shoot(join(shots, `${v.slug}-${width}.png`));
  } catch (e) {
    fail(tag, `browser check crashed: ${e.message}`);
  } finally {
    await tab.close();
  }
}

function homeUrl(query = '') { return pathToFileURL(join(root, 'index.html')).href + query; }

// Page-side: which theme is applied, judged from the DOM rather than the switcher's own state.
function themeState() {
  const links = [...document.querySelectorAll('link[data-theme-css]')];
  let stored = null;
  try { stored = localStorage.getItem('theme'); } catch (e) {}
  const sw = document.querySelector('theme-switcher');
  return {
    theme: document.documentElement.getAttribute('data-theme'),
    liveMedia: document.getElementById('live-css').media,
    links: links.map((l) => l.getAttribute('href')),
    loaded: links.every((l) => l.sheet && l.sheet.cssRules.length > 0),
    stored,
    search: location.search,
    select: sw && sw.shadowRoot ? sw.shadowRoot.querySelector('select').value : null,
    color: document.querySelector('meta[name="theme-color"]').content,
  };
}

// Page-side: links and buttons hidden under the switcher (at the current scroll position).
function switcherOverlaps() {
  const sw = document.querySelector('theme-switcher');
  if (!sw) return ['no <theme-switcher> on the page'];
  const s = sw.getBoundingClientRect();
  if (!s.width || !s.height) return ['switcher has no size'];
  if (s.right > innerWidth || s.left < 0 || s.top < 0 || s.bottom > innerHeight) return ['switcher is off screen'];
  const hits = [];
  for (const el of document.querySelectorAll('a, button, select, input, [role="button"]')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === 'hidden') continue;
    if (r.left < s.right && r.right > s.left && r.top < s.bottom && r.bottom > s.top) hits.push(`${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 30)}"`);
  }
  return hits;
}

function chooseTheme(slug) {
  const sel = document.querySelector('theme-switcher').shadowRoot.querySelector('select');
  sel.value = slug;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}

// Homepage: every theme via ?theme=, plus the dropdown's behaviour.
async function homepageChecks(cdp, shots) {
  const themes = [{ slug: '', name: 'default' }, ...selected];
  for (const width of [1280, 390]) {
    const tab = await openTab(cdp, { width });
    try {
      await tab.goto(homeUrl());
      await tab.eval(() => localStorage.clear());
      for (const v of themes) {
        const tag = `home${v.slug ? '?theme=' + v.slug : ''}@${width}`;
        await tab.goto(homeUrl(v.slug ? `?theme=${v.slug}` : ''));
        const st = await tab.eval(themeState);
        if (v.slug) {
          if (st.theme !== v.slug || st.liveMedia !== 'not all' || st.links.length !== 1 || st.links[0] !== `themes/${v.slug}.css` || !st.loaded) fail(tag, `theme not applied: ${JSON.stringify(st)}`);
        } else if (st.theme || st.liveMedia || st.links.length || tab.requests.some((u) => u.includes('/themes/'))) fail(tag, `default page loaded theme assets: ${JSON.stringify(st)}`);
        if (st.select !== v.slug) fail(tag, `dropdown shows "${st.select}" instead of "${v.slug}"`);
        // The default dark page predates this work; its contrast is out of scope here.
        await tab.audit(tag, { contrast: !!v.slug });
        for (const h of await tab.eval(switcherOverlaps)) fail(tag, `Theme dropdown covers ${h}`);
        await tab.shoot(join(shots, `home-${v.slug || 'default'}-${width}.png`), false);
      }
    } catch (e) {
      fail(`home@${width}`, `browser check crashed: ${e.message}`);
    } finally {
      await tab.close();
    }
  }

  // Behaviour, with motion enabled so the scroll animation runs too.
  const tab = await openTab(cdp, { width: 1280, reducedMotion: false });
  const tag = 'home dropdown';
  const settled = (slug) => tab.waitFor((s) => {
    const t = document.documentElement.getAttribute('data-theme') || '';
    const links = document.querySelectorAll('link[data-theme-css]');
    return t === s && (s ? links.length === 1 && links[0].sheet : links.length === 0);
  }, 10000, slug);
  try {
    await tab.goto(homeUrl());
    await tab.eval(() => localStorage.clear());

    for (const bad of ['../x', '..%2Fx', '__proto__', 'constructor', 'unknown', 'stripe.css', 'https://example.com/x', '']) {
      await tab.goto(homeUrl(`?theme=${encodeURIComponent(bad)}`));
      const st = await tab.eval(themeState);
      const fetched = tab.requests.filter((u) => !u.startsWith(homeUrl())).filter((u) => u.includes('/themes/') || u.includes('example.com') || /\/x(\.css)?$/.test(u));
      if (st.theme || st.liveMedia || st.links.length || fetched.length) fail(tag, `?theme=${bad} should fall back to the default: ${JSON.stringify({ ...st, fetched })}`);
    }

    await tab.goto(homeUrl());
    await tab.eval(chooseTheme, 'stripe');
    if (!(await settled('stripe'))) fail(tag, 'choosing Stripe did not apply it');
    let st = await tab.eval(themeState);
    if (st.liveMedia !== 'not all' || st.links[0] !== 'themes/stripe.css' || st.stored !== 'stripe' || st.search !== '?theme=stripe' || st.color !== '#ffffff') fail(tag, `after choosing Stripe: ${JSON.stringify(st)}`);

    await tab.goto(homeUrl());
    st = await tab.eval(themeState);
    if (st.theme !== 'stripe' || st.select !== 'stripe' || st.links[0] !== 'themes/stripe.css') fail(tag, `Stripe not restored on reload: ${JSON.stringify(st)}`);

    await tab.eval(chooseTheme, 'wired');
    await tab.eval(chooseTheme, 'monzo');
    if (!(await settled('monzo'))) fail(tag, 'switching twice in a row did not end on Monzo');
    await new Promise((r) => setTimeout(r, 800));
    st = await tab.eval(themeState);
    if (st.links.length !== 1 || st.links[0] !== 'themes/monzo.css' || st.stored !== 'monzo') fail(tag, `after switching twice: ${JSON.stringify(st)}`);

    // Switch while scrolled: nothing the scroll animation hid may stay invisible.
    for (const slug of ['discord', 'github', '']) {
      await tab.eval(() => document.getElementById('skills').scrollIntoView());
      await new Promise((r) => setTimeout(r, 300));
      await tab.eval(chooseTheme, slug);
      if (!(await settled(slug))) fail(tag, `switching to ${slug || 'default'} while scrolled did not apply`);
      await new Promise((r) => setTimeout(r, 2500));
      const hidden = await tab.eval(() => [...document.querySelectorAll('.exp-item, .edu-item, .skill-pill')]
        .filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0 && +getComputedStyle(el).opacity < 0.99; })
        .map((el) => el.className));
      if (hidden.length) fail(tag, `after switching to ${slug || 'default'} while scrolled, still invisible: ${hidden.slice(0, 3).join(', ')}`);
      for (const h of await tab.eval(switcherOverlaps)) fail(tag, `(${slug || 'default'}, scrolled) Theme dropdown covers ${h}`);
    }

    st = await tab.eval(themeState);
    if (st.theme || st.liveMedia || st.links.length || st.stored !== null || st.search.includes('theme=') || st.color !== '#080808') fail(tag, `after switching back to the default: ${JSON.stringify(st)}`);
    await tab.goto(homeUrl());
    st = await tab.eval(themeState);
    if (st.theme || st.links.length) fail(tag, `default not kept after reload: ${JSON.stringify(st)}`);
    for (const e of tab.errors) fail(tag, `console: ${e}`);
  } catch (e) {
    fail(tag, `browser check crashed: ${e.message}`);
  } finally {
    await tab.close();
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
  // body { overflow-x: hidden } (and overflow:hidden cards) hide overflow from
  // scrollWidth while still cutting content off, so flag any element poking
  // past the viewport unless it sits in an intentional horizontal scroller.
  const clippedByAncestor = (el) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const ox = getComputedStyle(n).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };
  const offenders = [...document.querySelectorAll('body *')].filter((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || r.right <= docW + 1) return false;
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' && r.left >= docW) return false;
    return !clippedByAncestor(el);
  });
  const overflow = Math.max(
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - docW,
    ...offenders.map((el) => Math.ceil(el.getBoundingClientRect().right - docW)),
    0,
  );
  const widest = offenders.slice(0, 4).map((el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''));
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
