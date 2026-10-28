import { defineConfig } from 'vitepress';
import { ugokuTransformer } from '@ugoku/shiki';

export default defineConfig({
  title: 'ugoku',
  cleanUrls: true,
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }]],
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
