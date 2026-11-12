#!/usr/bin/env node
// Sanity checks for content/profile.json and the renderer.
// Usage: node scripts/check-content.mjs   (exits 1 on problems)

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, loadContent, renderBody, renderJsonLd, renderMeta } from './render-content.mjs';

// Names that must never reappear (renamed employers etc.).
const RETIRED = [/just\s*appraised/i];

export function checkContent() {
  const problems = [];
  let c;
  try { c = loadContent(); } catch (e) { return [`content/profile.json is not valid JSON: ${e.message}`]; }
  const need = (path, ok = (v) => v !== undefined && v !== null && v !== '') => {
    const v = path.split('.').reduce((o, k) => (o == null ? o : o[k]), c);
    if (!ok(v)) problems.push(`missing or empty: ${path}`);
    return v;
  };
  const nonEmpty = (v) => Array.isArray(v) && v.length > 0;
  ['site.url', 'site.analyticsId', 'site.websiteDescription', 'person.name', 'person.jobTitle', 'person.summary', 'person.schemaDescription', 'person.email', 'person.location.label', 'person.image.src', 'person.image.alt', 'nav.logo', 'nav.cta', 'hero.firstName', 'hero.lastName', 'hero.photo.src', 'hero.badge', 'hero.taglineHtml', 'hero.primaryCta', 'experience.heading', 'education.heading', 'skills.heading', 'interests.heading', 'interests.bucketListTitle', 'footer.copyright'].forEach((p) => need(p));
  ['person.social', 'nav.links', 'hero.meta', 'experience.items', 'education.items', 'skills.items', 'interests.paragraphsHtml', 'interests.bucketList'].forEach((p) => need(p, nonEmpty));

  (c.experience?.items || []).forEach((e, i) => {
    if (!e.company || !e.dates) problems.push(`experience.items[${i}] needs company and dates`);
    if (!nonEmpty(e.roles) || e.roles.some((r) => !r.title || !nonEmpty(r.bullets))) problems.push(`experience.items[${i}] (${e.company}) needs roles with title and bullets`);
    if (e.logo && !(e.logo.src && e.logo.alt && e.logo.width && e.logo.height)) problems.push(`experience.items[${i}].logo needs src, alt, width, height`);
  });
  (c.education?.items || []).forEach((e, i) => { if (!e.school || !e.schemaType) problems.push(`education.items[${i}] needs school and schemaType`); });

  const images = [c.person?.image, c.hero?.photo, ...(c.experience?.items || []).map((e) => e.logo)].filter(Boolean);
  for (const img of images) if (!existsSync(join(root, img.src))) problems.push(`image not found: ${img.src}`);

  let rendered = '';
  try { rendered = renderMeta(c) + renderJsonLd(c) + renderBody(c); } catch (e) { problems.push(`renderer threw: ${e.message}`); }
  if (/undefined|\[object Object\]/.test(rendered)) problems.push('rendered markup contains "undefined" or "[object Object]"');

  const scan = [['content/profile.json', readFileSync(join(root, 'content/profile.json'), 'utf8')], ['index.html', readFileSync(join(root, 'index.html'), 'utf8')]];
  const tdir = join(root, 'templates');
  for (const d of readdirSync(tdir)) {
    const f = join(tdir, d, 'index.html');
    if (statSync(join(tdir, d)).isDirectory() && existsSync(f)) scan.push([`templates/${d}/index.html`, readFileSync(f, 'utf8')]);
  }
  for (const [name, text] of scan) for (const re of RETIRED) if (re.test(text)) problems.push(`${name} still mentions ${re}`);
  return problems;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const p = checkContent();
  if (p.length) { console.error(p.map((x) => '  ✗ ' + x).join('\n')); process.exit(1); }
  console.log('content: ok');
}
