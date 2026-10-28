import { defineConfig } from 'vitepress';
import { ugokuTransformer } from '@ugoku/shiki';

export default defineConfig({
  title: 'ugoku',
  cleanUrls: 'without-subfolders',
  head: [['link', { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }]],
  markdown: {
    codeTransformers: [ugokuTransformer()],
  },
  themeConfig: {
    logo: { light: '/mark.svg', dark: '/mark-dark.svg' },
    nav: [{ text: 'Roadmap', link: '/roadmap' }],
  },
});
