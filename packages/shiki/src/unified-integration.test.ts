import { expect, test } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypeShiki from '@shikijs/rehype';
import { ugokuTransformer } from './transformer';

type ThemeOption = { theme: string } | { themes: { light: string; dark: string } };

function render(markdown: string, themeOption: ThemeOption): Promise<string> {
  return unified()
    .use(remarkParse)
    .use(remarkRehype)
    .use(rehypeShiki, { ...themeOption, transformers: [ugokuTransformer()] })
    .use(rehypeStringify)
    .process(markdown)
    .then((file) => String(file));
}

test(
  'run fence stamps mode, lang, and hash through @shikijs/rehype',
  async () => {
    const html = await render(['```js run', "console.log('hello');", '```'].join('\n'), {
      theme: 'github-light',
    });
    expect(html).toContain('data-ugoku-mode="run"');
    expect(html).toContain('data-ugoku-lang="js"');
    expect(html).toMatch(/data-ugoku-hash="[0-9a-f]{10}"/);
  },
  10000,
);

test('run edit fence stamps run-edit through @shikijs/rehype', async () => {
  const html = await render(['```ts run edit', 'const x: number = 1;', '```'].join('\n'), {
    theme: 'github-light',
  });
  expect(html).toContain('data-ugoku-mode="run-edit"');
});

test('plain fence without run is untouched through @shikijs/rehype', async () => {
  const html = await render(['```js', 'const x = 1;', '```'].join('\n'), { theme: 'github-light' });
  expect(html).not.toContain('data-ugoku-mode');
});

test('dual-theme config stamps light and dark theme attributes through @shikijs/rehype', async () => {
  const html = await render(['```js run', 'const x = 1;', '```'].join('\n'), {
    themes: { light: 'github-light', dark: 'github-dark' },
  });
  expect(html).toContain('data-ugoku-theme-light="github-light"');
  expect(html).toContain('data-ugoku-theme-dark="github-dark"');
  expect(html).not.toContain('data-ugoku-theme="');
});
