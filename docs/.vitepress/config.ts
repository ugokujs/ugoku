import { defineConfig } from 'vitepress';
import { ugokuTransformer } from '@ugoku/shiki';

export default defineConfig({
  title: 'ugoku',
  markdown: {
    codeTransformers: [ugokuTransformer()],
  },
});
