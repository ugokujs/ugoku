import type { AstroIntegration } from 'astro';
import { ugokuTransformer } from '@ugoku/shiki';

export function ugoku(): AstroIntegration {
  return {
    name: '@ugoku/astro',
    hooks: {
      'astro:config:setup': ({ updateConfig, injectScript }) => {
        updateConfig({
          markdown: {
            shikiConfig: {
              transformers: [ugokuTransformer()],
            },
          },
        });
        injectScript('page', "import '@ugoku/astro/client';");
      },
    },
  };
}
