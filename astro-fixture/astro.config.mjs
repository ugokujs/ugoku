import { defineConfig } from 'astro/config';
import { ugoku } from '@ugoku/astro';

export default defineConfig({
  integrations: [ugoku()],
});
