import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'browser',
          include: ['packages/core/**/*.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        test: {
          name: 'node',
          include: ['packages/shiki/**/*.test.ts', 'packages/vitepress/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
