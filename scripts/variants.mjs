// The 20 design-system variants of index.html built by scripts/build-variants.mjs.
// `source` is the folder in github.com/feimacode/open-design-agent-kit whose
// tokens.json / README.md the stylesheet in templates/<slug>/style.css follows.
// Fonts are declared by `@import url(https://fonts.googleapis.com/...)` lines at
// the top of each style.css; the generator turns them into <link> tags.

export const variants = [
  { slug: 'apple', name: 'Apple', source: 'claude-design-systems/apple', theme: '#ffffff', mode: 'light', blurb: 'Centred product page, alternating grey bands' },
  { slug: 'stripe', name: 'Stripe', source: 'claude-design-systems/stripe', theme: '#ffffff', mode: 'light', blurb: 'Skewed gradient hero, light-weight type' },
  { slug: 'claude', name: 'Claude', source: 'claude-design-systems/claude', theme: '#f5f4ed', mode: 'light', blurb: 'Warm paper, serif, one reading column' },
  { slug: 'notion', name: 'Notion', source: 'claude-design-systems/notion', theme: '#ffffff', mode: 'light', blurb: 'Document page with cover and callouts' },
  { slug: 'vercel', name: 'Vercel', source: 'claude-design-systems/vercel', theme: '#ffffff', mode: 'light', blurb: 'Monochrome Geist with construction grid' },
  { slug: 'airbnb', name: 'Airbnb', source: 'claude-design-systems/airbnb', theme: '#ffffff', mode: 'light', blurb: 'Host-profile card and rounded listings' },
  { slug: 'github', name: 'GitHub', source: 'claude-design-systems/github', theme: '#ffffff', mode: 'light', blurb: 'Profile page with sticky sidebar' },
  { slug: 'discord', name: 'Discord', source: 'claude-design-systems/discord', theme: '#313338', mode: 'dark', blurb: 'App shell with server rail and embeds' },
  { slug: 'figma', name: 'Figma', source: 'claude-design-systems/figma', theme: '#ffffff', mode: 'light', blurb: 'Giant type and colour-block sections' },
  { slug: 'slack', name: 'Slack', source: 'claude-design-systems/slack', theme: '#4a154b', mode: 'light', blurb: 'Aubergine hero, four-colour accents' },
  { slug: 'spotify', name: 'Spotify', source: 'claude-design-systems/spotify', theme: '#121212', mode: 'dark', blurb: 'Playlist header and coloured tiles' },
  { slug: 'coinbase', name: 'Coinbase', source: 'claude-design-systems/coinbase', theme: '#ffffff', mode: 'light', blurb: 'Clean fintech, big rounded cards' },
  { slug: 'monzo', name: 'Monzo', source: 'claude-design-systems/monzo-ios', theme: '#f6f7f9', mode: 'light', blurb: 'Mobile app feed on grey' },
  { slug: 'nvidia', name: 'NVIDIA', source: 'claude-design-systems/nvidia', theme: '#000000', mode: 'dark', blurb: 'Black and green spec sheet' },
  { slug: 'cohere', name: 'Cohere', source: 'claude-design-systems/cohere', theme: '#ffffff', mode: 'light', blurb: 'Bento hero with a forest-green band' },
  { slug: 'mistral', name: 'Mistral AI', source: 'claude-design-systems/mistral-ai', theme: '#fffaeb', mode: 'light', blurb: 'Cream and orange with sunset stripes' },
  { slug: 'perplexity', name: 'Perplexity', source: 'claude-design-systems/perplexity', theme: '#0f0f10', mode: 'dark', blurb: 'Answer-engine column with serif heads' },
  { slug: 'huggingface', name: 'Hugging Face', source: 'claude-design-systems/huggingface', theme: '#fafafa', mode: 'light', blurb: 'Model cards with mono headings' },
  { slug: 'wired', name: 'WIRED (editorial)', source: 'claude-design-systems/wired', theme: '#ffffff', mode: 'light', blurb: 'Magazine page with wide type and rules' },
  { slug: 'neobrutalism', name: 'Neobrutalism (bold)', source: 'claude-design-systems/neobrutalism', theme: '#fff4cf', mode: 'light', blurb: 'Thick outlines and hard shadows' },
];
