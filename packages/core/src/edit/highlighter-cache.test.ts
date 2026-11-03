import { expect, test } from 'vitest';
import { ensureLoaded } from './highlighter-cache';
import { registerLanguageLoader, registerThemeLoader } from './loader-registry';

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

test('ensureLoaded resolves a custom-registered language not in Shiki\'s bundle', async () => {
  registerLanguageLoader('my-custom-lang', () => ({
    name: 'my-custom-lang',
    scopeName: 'source.my-custom-lang',
    patterns: [],
  } as any));

  const highlighter = await ensureLoaded('my-custom-lang', ['github-light']);
  const html = highlighter.codeToHtml('hello world', { lang: 'my-custom-lang', theme: 'github-light' });
  expect(html).toContain('<pre');
  expect(html).toContain('hello world');
});

test('ensureLoaded resolves a custom-registered theme not in Shiki\'s bundle', async () => {
  registerThemeLoader('my-custom-theme', () => ({
    name: 'my-custom-theme',
    type: 'dark',
    colors: {},
    tokenColors: [],
  }));

  const highlighter = await ensureLoaded('javascript', ['my-custom-theme']);
  const html = highlighter.codeToHtml('let x = 1;', { lang: 'javascript', theme: 'my-custom-theme' });
  expect(html).toContain('my-custom-theme');
});

test('ensureLoaded still rejects a name that is in neither Shiki\'s bundle nor the custom registry', async () => {
  await expect(ensureLoaded('not-registered-anywhere', ['github-light'])).rejects.toThrow();
  await expect(ensureLoaded('javascript', ['also-not-registered-anywhere'])).rejects.toThrow();
});

test('a bundled language name is never shadowed by a same-named custom registration', async () => {
  // "python" is a real Shiki-bundled language that no earlier test in this file
  // loads — it must still be unloaded in the shared highlighter singleton at
  // this point, so this actually exercises the bundled-vs-custom branch
  // (a name the singleton has already loaded would skip straight past both
  // branches via the `getLoadedLanguages().includes(lang)` check, and the
  // throwing custom loader would never run regardless of which branch is
  // checked first — that would make this test pass even if the precedence
  // were broken).
  registerLanguageLoader('python', (() => {
    throw new Error('this loader must never be called — python is bundled');
  }));

  await expect(ensureLoaded('python', ['github-light'])).resolves.toBeDefined();
});
