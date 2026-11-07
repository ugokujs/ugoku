import { defineConfig } from 'vitepress';
import { ugokuTransformer } from '@ugoku/shiki';

const hostname = 'https://ugokujs.netlify.app';
const description =
  'Lightweight, local-first runnable code snippets for sites that use Shiki. Add `run` to a code fence, readers get a Run button and console output — no server, ever.';

export default defineConfig({
  title: 'ugoku',
  description,
  cleanUrls: true,
  sitemap: {
    hostname,
  },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'ugoku' }],
    ['meta', { property: 'og:description', content: description }],
    ['meta', { property: 'og:url', content: hostname }],
    ['meta', { property: 'og:image', content: `${hostname}/mark.svg` }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['meta', { name: 'twitter:title', content: 'ugoku' }],
    ['meta', { name: 'twitter:description', content: description }],
    ['meta', { name: 'twitter:image', content: `${hostname}/mark.svg` }],
  ],
  markdown: {
    codeTransformers: [ugokuTransformer()],
  },
  themeConfig: {
    logo: { light: '/mark.svg', dark: '/mark-dark.svg' },
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/guide' },
      { text: 'Roadmap', link: '/roadmap' },
    ],
  },
});
