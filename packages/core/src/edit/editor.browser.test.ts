import { expect, test } from 'vitest';
import { highlightInto } from './editor';

function createPre(opts: { lang: string; theme?: string; themeLight?: string; themeDark?: string }): HTMLElement {
  const pre = document.createElement('pre');
  pre.dataset.ugokuLang = opts.lang;
  if (opts.theme) pre.dataset.ugokuTheme = opts.theme;
  if (opts.themeLight) pre.dataset.ugokuThemeLight = opts.themeLight;
  if (opts.themeDark) pre.dataset.ugokuThemeDark = opts.themeDark;
  const code = document.createElement('code');
  code.textContent = 'placeholder';
  pre.appendChild(code);
  document.body.appendChild(pre);
  return pre;
}

test('highlightInto re-highlights a single-theme block', async () => {
  const pre = createPre({ lang: 'javascript', theme: 'github-light' });

  await highlightInto(pre, 'let x = 1;');

  expect(pre.className).toContain('shiki');
  expect(pre.querySelector('code')?.innerHTML).toContain('span');

  pre.remove();
});

test('highlightInto re-highlights a dual-theme block', async () => {
  const pre = createPre({ lang: 'typescript', themeLight: 'github-light', themeDark: 'github-dark' });

  await highlightInto(pre, 'let x: number = 1;');

  expect(pre.querySelector('code')?.innerHTML).toContain('--shiki-dark');

  pre.remove();
});

test('highlightInto rejects when the lang is unsupported, leaving the pre untouched', async () => {
  const pre = createPre({ lang: 'not-a-real-lang', theme: 'github-light' });
  const before = pre.querySelector('code')!.innerHTML;

  await expect(highlightInto(pre, 'x')).rejects.toThrow();
  expect(pre.querySelector('code')?.innerHTML).toBe(before);

  pre.remove();
});

test('highlightInto is a no-op when no theme attributes are present', async () => {
  const pre = createPre({ lang: 'javascript' });
  await expect(highlightInto(pre, 'let x = 1;')).resolves.toBeUndefined();
  pre.remove();
});
