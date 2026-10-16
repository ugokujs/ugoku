import { expect, test } from 'vitest';
import { codeToHtml } from 'shiki';
import type { ShikiTransformer } from 'shiki';
import { ugokuTransformer } from './transformer';

const theme = 'github-light';

test('plain fence without run is left byte-identical', async () => {
  const options = { lang: 'js' as const, theme, meta: { __raw: '{1,3}' } };
  const withTransformer = await codeToHtml('const x = 1;', { ...options, transformers: [ugokuTransformer()] });
  const withoutTransformer = await codeToHtml('const x = 1;', options);
  expect(withTransformer).toBe(withoutTransformer);
});

test('run stamps data-ugoku-mode, lang, theme, and hash', async () => {
  const html = await codeToHtml('const x = 1;', {
    lang: 'js',
    theme,
    meta: { __raw: 'run' },
    transformers: [ugokuTransformer()],
  });
  expect(html).toContain('data-ugoku-mode="run"');
  expect(html).toContain('data-ugoku-lang="js"');
  expect(html).toContain('data-ugoku-theme="github-light"');
  expect(html).toMatch(/data-ugoku-hash="[0-9a-f]{10}"/);
});

test('run edit stamps run-edit', async () => {
  const html = await codeToHtml('const x = 1;', {
    lang: 'ts',
    theme,
    meta: { __raw: 'run edit' },
    transformers: [ugokuTransformer()],
  });
  expect(html).toContain('data-ugoku-mode="run-edit"');
});

test('run and edit coexist with other meta tokens regardless of order', async () => {
  const html = await codeToHtml('const x = 1;', {
    lang: 'ts',
    theme,
    meta: { __raw: '{1,3} run :line-numbers edit [file.ts]' },
    transformers: [ugokuTransformer()],
  });
  expect(html).toContain('data-ugoku-mode="run-edit"');
});

test('does not interfere with another transformer reading its own meta token', async () => {
  const stub: ShikiTransformer = {
    name: 'stub',
    pre(hast) {
      if (this.options.meta?.__raw?.includes(':line-numbers')) {
        hast.properties['data-stub-line-numbers'] = 'true';
      }
    },
  };
  const html = await codeToHtml('const x = 1;', {
    lang: 'ts',
    theme,
    meta: { __raw: 'run :line-numbers' },
    transformers: [ugokuTransformer(), stub],
  });
  expect(html).toContain('data-ugoku-mode="run"');
  expect(html).toContain('data-stub-line-numbers="true"');
});

test('run edit downgrades to run when twoslash is present', async () => {
  const html = await codeToHtml('const x = 1;', {
    lang: 'ts',
    theme,
    meta: { __raw: 'run edit twoslash' },
    transformers: [ugokuTransformer()],
  });
  expect(html).toContain('data-ugoku-mode="run"');
  expect(html).not.toContain('data-ugoku-mode="run-edit"');
});

test('dual-theme config stamps light and dark theme attributes', async () => {
  const html = await codeToHtml('const x = 1;', {
    lang: 'js',
    themes: { light: 'github-light', dark: 'github-dark' },
    meta: { __raw: 'run' },
    transformers: [ugokuTransformer()],
  });
  expect(html).toContain('data-ugoku-theme-light="github-light"');
  expect(html).toContain('data-ugoku-theme-dark="github-dark"');
  expect(html).not.toContain('data-ugoku-theme=');
});

test('single-theme config stamps one theme attribute', async () => {
  const html = await codeToHtml('const x = 1;', {
    lang: 'js',
    theme,
    meta: { __raw: 'run' },
    transformers: [ugokuTransformer()],
  });
  expect(html).toContain('data-ugoku-theme="github-light"');
  expect(html).not.toContain('data-ugoku-theme-light=');
});

test('hash is deterministic for identical source and differs when source changes', async () => {
  const makeHtml = (code: string) =>
    codeToHtml(code, { lang: 'js', theme, meta: { __raw: 'run' }, transformers: [ugokuTransformer()] });

  const first = await makeHtml('const x = 1;');
  const same = await makeHtml('const x = 1;');
  const different = await makeHtml('const x = 2;');

  const extractHash = (html: string) => html.match(/data-ugoku-hash="([0-9a-f]{10})"/)?.[1];

  expect(extractHash(first)).toBe(extractHash(same));
  expect(extractHash(first)).not.toBe(extractHash(different));
});
