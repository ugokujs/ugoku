import { defineConfig } from 'astro/config';
import { ugoku } from '@ugoku/astro';

function dummyTransformerIntegration() {
  return {
    name: 'dummy-transformer',
    hooks: {
      'astro:config:setup': ({ updateConfig }) => {
        updateConfig({
          markdown: {
            shikiConfig: {
              transformers: [
                {
                  name: 'dummy',
                  pre(node) {
                    node.properties['data-dummy-transformer'] = 'true';
                  },
                },
              ],
            },
          },
        });
      },
    },
  };
}

export default defineConfig({
  integrations: [ugoku(), dummyTransformerIntegration()],
});
