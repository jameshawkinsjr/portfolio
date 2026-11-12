// The 20 design-system variants of index.html built by scripts/build-variants.mjs.
// `source` is the folder in github.com/feimacode/open-design-agent-kit whose
// tokens.json / README.md the stylesheet in templates/<slug>/style.css follows.
// Fonts are declared by `@import url(https://fonts.googleapis.com/...)` lines at
// the top of each style.css; the generator turns them into <link> tags.

export const variants = [
  { slug: 'apple', name: 'Apple', source: 'claude-design-systems/apple', theme: '#ffffff' },
  { slug: 'stripe', name: 'Stripe', source: 'claude-design-systems/stripe', theme: '#ffffff' },
  { slug: 'claude', name: 'Claude', source: 'claude-design-systems/claude', theme: '#f5f4ed' },
  { slug: 'notion', name: 'Notion', source: 'claude-design-systems/notion', theme: '#ffffff' },
  { slug: 'vercel', name: 'Vercel', source: 'claude-design-systems/vercel', theme: '#ffffff' },
  { slug: 'airbnb', name: 'Airbnb', source: 'claude-design-systems/airbnb', theme: '#ffffff' },
  { slug: 'github', name: 'GitHub', source: 'claude-design-systems/github', theme: '#ffffff' },
  { slug: 'discord', name: 'Discord', source: 'claude-design-systems/discord', theme: '#313338' },
  { slug: 'figma', name: 'Figma', source: 'claude-design-systems/figma', theme: '#ffffff' },
  { slug: 'slack', name: 'Slack', source: 'claude-design-systems/slack', theme: '#4a154b' },
  { slug: 'spotify', name: 'Spotify', source: 'claude-design-systems/spotify', theme: '#121212' },
  { slug: 'coinbase', name: 'Coinbase', source: 'claude-design-systems/coinbase', theme: '#ffffff' },
  { slug: 'monzo', name: 'Monzo', source: 'claude-design-systems/monzo-ios', theme: '#14233c' },
  { slug: 'nvidia', name: 'NVIDIA', source: 'claude-design-systems/nvidia', theme: '#000000' },
  { slug: 'cohere', name: 'Cohere', source: 'claude-design-systems/cohere', theme: '#ffffff' },
  { slug: 'mistral', name: 'Mistral AI', source: 'claude-design-systems/mistral-ai', theme: '#fffaeb' },
  { slug: 'perplexity', name: 'Perplexity', source: 'claude-design-systems/perplexity', theme: '#0f0f10' },
  { slug: 'huggingface', name: 'Hugging Face', source: 'claude-design-systems/huggingface', theme: '#fafafa' },
  { slug: 'wired', name: 'WIRED (editorial)', source: 'claude-design-systems/wired', theme: '#ffffff' },
  { slug: 'neobrutalism', name: 'Neobrutalism (bold)', source: 'claude-design-systems/neobrutalism', theme: '#fff4cf' },
];
