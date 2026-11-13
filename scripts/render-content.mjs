// Pure renderers that turn content/profile.json into the page markup.
// The live page (scripts/build-site.mjs) and every design variant
// (scripts/build-variants.mjs) use the same renderBody(), so all pages share
// identical markup and differ only in their stylesheet. Keep class names and
// inline styles stable: the live CSS, templates/_shared/base.css and every
// templates/<slug>/style.css depend on them.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadContent() {
  return JSON.parse(readFileSync(join(root, 'content', 'profile.json'), 'utf8'));
}

/** Escape text for HTML element content and attribute values. */
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const EXT = 'target="_blank" rel="noopener noreferrer"';
const lcFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

/** Page meta derived from one source so title/descriptions can't disagree. */
export function pageMeta(c) {
  const { person, site } = c;
  const headline = `${person.name} — ${person.jobTitle}`;
  return {
    title: `${headline} | ${person.location.label}`,
    headline,
    description: `${person.name} — ${lcFirst(person.summary)}`,
    socialDescription: person.summary,
    canonical: site.url,
    imageUrl: new URL(person.image.src, site.url).href,
  };
}

/** The <title>, SEO, Open Graph and Twitter tags for the live page. */
export function renderMeta(c) {
  const m = pageMeta(c);
  const { person } = c;
  return `  <!-- Primary SEO -->
  <title>${esc(m.title)}</title>
  <meta name="description" content="${esc(m.description)}" />
  <meta name="author" content="${esc(person.name)}" />
  <meta name="robots" content="max-image-preview:large" />
  <link rel="canonical" href="${esc(m.canonical)}" />

  <!-- Open Graph -->
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="${esc(person.name)}" />
  <meta property="og:url" content="${esc(m.canonical)}" />
  <meta property="og:title" content="${esc(m.headline)}" />
  <meta property="og:description" content="${esc(m.socialDescription)}" />
  <meta property="og:image" content="${esc(m.imageUrl)}" />
  <meta property="og:image:width" content="${person.image.width}" />
  <meta property="og:image:height" content="${person.image.height}" />
  <meta property="og:image:type" content="image/jpeg" />
  <meta property="og:image:alt" content="${esc(person.image.alt)}" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${esc(m.headline)}" />
  <meta name="twitter:description" content="${esc(m.socialDescription)}" />
  <meta name="twitter:image" content="${esc(m.imageUrl)}" />
  <meta name="twitter:image:alt" content="${esc(person.image.alt)}" />`;
}

/** schema.org JSON-LD; knowsAbout comes from the skills list. */
export function renderJsonLd(c) {
  const { person, site } = c;
  const id = (frag) => `${site.url}#${frag}`;
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': id('website'), url: site.url, name: person.name, description: site.websiteDescription, publisher: { '@id': id('person') }, inLanguage: 'en' },
      { '@type': 'ProfilePage', '@id': id('profilepage'), url: site.url, name: person.name, isPartOf: { '@id': id('website') }, mainEntity: { '@id': id('person') }, inLanguage: 'en' },
      {
        '@type': 'Person',
        '@id': id('person'),
        name: person.name,
        url: site.url,
        image: pageMeta(c).imageUrl,
        jobTitle: person.jobTitle,
        description: person.schemaDescription,
        email: person.email,
        address: { '@type': 'PostalAddress', addressLocality: person.location.city, addressRegion: person.location.region, addressCountry: person.location.country },
        alumniOf: [...c.education.items].reverse().map((e) => ({ '@type': e.schemaType, name: e.school })),
        knowsAbout: c.skills.items,
        sameAs: person.social.map((s) => s.url),
      },
    ],
  };
  // Escape "<" so content can never close the script element.
  const json = JSON.stringify(graph, null, 2).replace(/</g, '\\u003c');
  return `  <script type="application/ld+json">\n${json.replace(/^/gm, '  ')}\n  </script>`;
}

function img(i, cls, extra) {
  return `<img src="${esc(i.src)}" alt="${esc(i.alt)}"${cls ? ` class="${cls}"` : ''} width="${i.width}" height="${i.height}" ${extra} />`;
}

function renderExperience(e) {
  const name = e.url
    ? `<a href="${esc(e.url)}" ${EXT} style="color: inherit; text-decoration: none;">${esc(e.company)}</a>`
    : esc(e.company);
  const roles = e.roles
    .map(
      (r) => `          <div class="exp-role-entry">
            <div class="exp-role-header">
              <h4 class="exp-role">${esc(r.title)}</h4>
            </div>
            <ul class="exp-bullets">
${r.bullets.map((b) => `              <li>${esc(b)}</li>`).join('\n')}
            </ul>
          </div>`,
    )
    .join('\n');
  const tags = e.tags && e.tags.length
    ? `\n        <div class="exp-tags">\n${e.tags.map((t) => `          <span class="tag">${esc(t)}</span>`).join('\n')}\n        </div>`
    : '';
  const logo = e.logo
    ? `          ${img(e.logo, `exp-logo${e.logo.onDark ? ' exp-logo--ondark' : ''}`, 'loading="lazy" decoding="async"')}\n`
    : '';
  return `      <div class="exp-item exp-item--grouped">
        <div class="exp-company-header">
${logo}          <div>
            <h3 class="exp-role" style="font-size: 1rem;">${name}</h3>
            <div class="exp-company">${esc(e.dates)}</div>
          </div>
        </div>
        <div class="exp-roles">
${roles}
        </div>${tags}
      </div>`;
}

/**
 * Everything between <body> and the page scripts. `assetPrefix` is prepended
 * to local image paths (variants live two folders down and use "../../").
 */
export function renderBody(c, { assetPrefix = '' } = {}) {
  const { person, nav, hero, experience: x, education: ed, skills: sk, interests: it } = c;
  const mail = `mailto:${person.email}`;
  const local = (i) => ({ ...i, src: assetPrefix + i.src });
  const withPrefix = (e) => (e.logo ? { ...e, logo: local(e.logo) } : e);

  return `
  <!-- NAV -->
  <nav aria-label="Main navigation">
    <a class="nav-logo" href="#top" aria-label="${esc(nav.logoLabel)}">${esc(nav.logo)}</a>
    <ul class="nav-links">
${nav.links.map((l) => `      <li><a href="${esc(l.href)}">${esc(l.label)}</a></li>`).join('\n')}
      <li><a href="${esc(mail)}" class="nav-cta">${esc(nav.cta)}</a></li>
    </ul>
  </nav>

  <!-- HERO -->
  <main id="main">
  <header class="hero" id="top">
    <div class="hero-inner">
      <div class="hero-text">
      <div class="hero-name-row fade-in">
        <div class="hero-photo">
          ${img(local(hero.photo), '', 'fetchpriority="high" decoding="async"')}
        </div>
        <h1>
          ${esc(hero.firstName)}<br/>
          <span class="line-2">${esc(hero.lastName)}</span>
        </h1>
      </div>
      <p class="hero-badge fade-in">
        <span class="dot"></span>
        ${esc(hero.badge)}
      </p>
      <p class="hero-tagline fade-in">
        ${hero.taglineHtml}
      </p>
      <div class="hero-links fade-in">
        <a href="${esc(mail)}" class="btn btn-primary">${esc(hero.primaryCta)}</a>
${person.social.map((s) => `        <a href="${esc(s.url)}" ${EXT} class="btn btn-secondary">${esc(s.label)}</a>`).join('\n')}
      </div>
      <div class="hero-meta fade-in">
${hero.meta
  .map(
    (m) => `        <div class="meta-item">
          <span class="meta-label">${esc(m.label)}</span>
          <span class="meta-value">${esc(m.value)}</span>
        </div>`,
  )
  .join('\n')}
      </div>
      </div>
    </div>
  </header>

  <!-- EXPERIENCE -->
  <section id="experience">
    <p class="section-label">${esc(x.label)}</p>
    <h2>${esc(x.heading)}</h2>
    <p style="color: var(--text-muted); font-size:0.9rem; margin-bottom: 2.5rem; margin-top: 0.5rem;">${esc(x.intro)}</p>

    <div class="exp-grid">

${x.items.map(withPrefix).map(renderExperience).join('\n\n')}

    </div>
  </section>

  <!-- EDUCATION -->
  <section id="education">
    <p class="section-label">${esc(ed.label)}</p>
    <h2>${esc(ed.heading)}</h2>
    <div class="edu-grid" style="margin-top: 2rem;">
${ed.items
  .map(
    (e) => `      <div class="edu-item">
        <h3 class="edu-school">${esc(e.school)}</h3>
        <div class="edu-degree">${esc(e.degree)}</div>
        <div class="edu-date">${esc(e.dates)}</div>
      </div>`,
  )
  .join('\n')}
    </div>
  </section>

  <!-- SKILLS -->
  <section id="skills">
    <p class="section-label">${esc(sk.label)}</p>
    <h2>${esc(sk.heading)}</h2>
    <p style="color: var(--text-muted); font-size:0.9rem; margin-bottom: 2rem; margin-top: 0.5rem;">${esc(sk.intro)}</p>
    <div class="skills-grid">
${sk.items.map((s) => `      <span class="skill-pill">${esc(s)}</span>`).join('\n')}
    </div>
  </section>

  <!-- INTERESTS -->
  <section id="interests">
    <p class="section-label">${esc(it.label)}</p>
    <h2>${esc(it.heading)}</h2>
    <div class="interests-inner" style="margin-top: 2rem;">
      <div>
${it.paragraphsHtml
  .map(
    (p, i) => `        <p class="interests-text"${i ? ' style="margin-top: 1rem;"' : ''}>
          ${p}
        </p>`,
  )
  .join('\n')}
      </div>
      <div>
        <p style="font-family: var(--font-mono); font-size: 0.7rem; color: var(--text-dim); letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 1rem;">${esc(it.bucketListTitle)}</p>
        <ul class="bucket-list">
${it.bucketList
  .map((b) => `          <li${b.done ? ' class="done"' : ''}><span class="check">${b.done ? '✓' : ''}</span><span>${esc(b.text)}</span></li>`)
  .join('\n')}
        </ul>
      </div>
    </div>
  </section>
  </main>

  <!-- FOOTER -->
  <footer style="position: relative; z-index: 1; max-width: 1100px; margin: 0 auto; padding: 2.5rem; border-top: 1px solid var(--border); font-size: 0.8rem; color: var(--text-dim); display: flex; justify-content: space-between; flex-wrap: wrap; gap: 1rem;">
    <p>${esc(c.footer.copyright)}</p>
    <p>
      ${[{ url: mail, label: person.email, own: true }, ...person.social]
        .map((l) => `<a href="${esc(l.url)}"${l.own ? '' : ' ' + EXT} style="color: var(--text-muted);">${esc(l.label)}</a>`)
        .join(' ·\n      ')}
    </p>
  </footer>
`;
}
