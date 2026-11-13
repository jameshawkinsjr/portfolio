# Site content

`profile.json` holds all the copy for the site. The live `index.html` and every
design variant in `templates/` are generated from it, so **edit copy here, then run**:

```sh
node scripts/build-site.mjs       # regenerates index.html
node scripts/build-variants.mjs   # regenerates templates/*/index.html, gallery, themes/*.css
node scripts/check-variants.mjs   # verifies everything (add --static to skip Chrome)
```

Never hand-edit `index.html` or `templates/*/index.html`: the next build overwrites them.

## Schema

Plain strings are escaped on render. Keys ending in `Html` are trusted HTML
fragments (used for inline `<strong>` emphasis), so escape `&` as `&amp;` in them.

| Key | What it drives |
|---|---|
| `site.url`, `site.analyticsId`, `site.websiteDescription` | Canonical/OG URLs, the GA4 tag, the JSON-LD `WebSite` description |
| `site.themeLabel`, `site.themeDefaultName` | The homepage "Theme" dropdown's label and the name of the default (original) look |
| `person.name`, `person.jobTitle` | `<title>` (`name — jobTitle \| location`), OG/Twitter titles, JSON-LD |
| `person.summary` | OG/Twitter description; the meta description is `name — summary` |
| `person.schemaDescription` | JSON-LD `Person.description` |
| `person.email`, `person.location`, `person.image` | Contact links, hero/footer mail links, JSON-LD address, OG image |
| `person.social[] {label, url}` | Hero buttons, footer links, JSON-LD `sameAs` |
| `nav.logo`, `nav.logoLabel`, `nav.links[] {label, href}`, `nav.cta` | Top navigation (the CTA mails `person.email`) |
| `hero.firstName`, `hero.lastName`, `hero.photo`, `hero.badge`, `hero.taglineHtml`, `hero.primaryCta`, `hero.meta[] {label, value}` | Hero |
| `experience.label/heading/intro`, `experience.items[]` | Experience. Each item: `company`, optional `url`, optional `logo {src, alt, width, height, onDark}`, `dates`, `roles[] {title, bullets[]}`, `tags[]` (omit or empty for none) |
| `education.items[] {school, degree, dates, schemaType}` | Education, and JSON-LD `alumniOf` (`schemaType` is the schema.org type) |
| `skills.items[]` | Skill pills, and JSON-LD `knowsAbout` |
| `interests.paragraphsHtml[]`, `interests.bucketListTitle`, `interests.bucketList[] {text, done}` | Interests |
| `footer.copyright` | Footer line |

Image paths are relative to the repo root (`img/...`); variants rebase them automatically.
`node scripts/check-content.mjs` checks required fields, that every image exists, and that
retired names (e.g. "Just Appraised") don't reappear.
