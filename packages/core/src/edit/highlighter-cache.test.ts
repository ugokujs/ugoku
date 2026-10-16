import { expect, test } from 'vitest';
import { ensureLoaded } from './highlighter-cache';

test('ensureLoaded loads a supported language and theme and returns a usable highlighter', async () => {
  const highlighter = await ensureLoaded('javascript', ['github-light']);
  const html = highlighter.codeToHtml('let x = 1;', { lang: 'javascript', theme: 'github-light' });
  expect(html).toContain('<pre');
  expect(html).toContain('<code>');
});

test('ensureLoaded is idempotent for a language/theme already loaded', async () => {
  await ensureLoaded('javascript', ['github-light']);
  await expect(ensureLoaded('javascript', ['github-light'])).resolves.toBeDefined();
});

test('ensureLoaded rejects an unsupported language', async () => {
  await expect(ensureLoaded('not-a-real-lang', ['github-light'])).rejects.toThrow();
});

test('ensureLoaded rejects an unsupported theme', async () => {
  await expect(ensureLoaded('javascript', ['not-a-real-theme'])).rejects.toThrow();
});

test('ensureLoaded loads multiple themes for a dual-theme block', async () => {
  const highlighter = await ensureLoaded('typescript', ['github-light', 'github-dark']);
  const html = highlighter.codeToHtml('let x: number = 1;', {
    lang: 'typescript',
    themes: { light: 'github-light', dark: 'github-dark' },
  });
  expect(html).toContain('--shiki-dark');
});
