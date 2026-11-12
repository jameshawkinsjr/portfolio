# Portfolio design variants

Twenty restyles of the root `index.html`, each after one design system from
[feimacode/open-design-agent-kit](https://github.com/feimacode/open-design-agent-kit)
(`claude-design-systems/<system>/project/`). Open `templates/index.html` for a gallery,
or any `templates/<slug>/index.html` directly from disk (`file://` works).

These are previews for choosing a new look. They are not linked from the site,
not in `sitemap.xml`, and every page has `noindex, nofollow`. Their canonical
URL is the live home page.

## How they're made

- `templates/<slug>/index.html` and `templates/index.html` are **generated**. Don't edit them.
- `scripts/build-variants.mjs` copies the `<body>` of the root `index.html` verbatim
  (without the GA4 tag, and with `img/` paths rebased to `../../img/`) and swaps the
  `<head>` for one that inlines `templates/_shared/base.css` + `templates/<slug>/style.css`.
- `scripts/variants.mjs` lists the variants (slug, name, source system, theme colour).
- Each `style.css` defines the same CSS variables as the live page (`--bg`, `--text`,
  `--text-red`, `--font-display`, …) because the body's inline styles use them. Its
  `@import` lines for Google Fonts become `<link>` tags.

So **copy edits go in the root `index.html`**, then regenerate:

```sh
node scripts/build-variants.mjs        # all variants + gallery (or pass slugs)
node scripts/check-variants.mjs        # or --static to skip the browser checks
```

`check-variants.mjs` fails if any variant's text or body markup differs from
`index.html`, if noindex/canonical are missing or analytics slipped in, or if a page
at 1280px or 390px shows horizontal overflow, a broken image, a console error, a
failed web font, text injected via CSS `content`, or AA contrast failures on solid
backgrounds. It needs Google Chrome (or `CHROME=/path/to/chrome`), and saves
screenshots to `templates/_screenshots/` (git-ignored).

## Shipping one

To make a variant the live design, move its `style.css` into the `<style>` block of
the root `index.html` (with `base.css`, and the font `<link>`s), and delete
`templates/` and the two scripts, or keep them out of the deploy. Revisit fonts and
brand cues before shipping: the variants borrow the visual language of real
companies, and some use Google Fonts stand-ins for proprietary typefaces.

## Credits

Design tokens and guidance come from feimacode/open-design-agent-kit
(MIT licence, © 2026 Iven Xu). Its design-system content is vendored from
[nexu-io/open-design](https://github.com/nexu-io/open-design) (Apache-2.0). Only colour,
type, spacing, radius and component styling were used: no logos, wordmarks or
product imagery. Fonts load from Google Fonts under their own (OFL) licences.
