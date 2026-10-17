import { expect, test } from 'vitest';
import { highlightInto } from './standalone-entry';

function createPre(lang: string): HTMLElement {
  const pre = document.createElement('pre');
  pre.dataset.ugokuLang = lang;
  pre.dataset.ugokuTheme = 'github-light';
  const code = document.createElement('code');
  code.textContent = 'placeholder';
  pre.appendChild(code);
  document.body.appendChild(pre);
  return pre;
}

test('highlightInto recognizes the "ts" shorthand, not just "typescript"', async () => {
  const pre = createPre('ts');
  await highlightInto(pre, 'let x: number = 1;');
  expect(pre.className).toContain('shiki');
  pre.remove();
});

test('highlightInto recognizes the "js" shorthand, not just "javascript"', async () => {
  const pre = createPre('js');
  await highlightInto(pre, 'let x = 1;');
  expect(pre.className).toContain('shiki');
  pre.remove();
});

test('highlightInto still rejects genuinely unsupported langs', async () => {
  const pre = createPre('python');
  const before = pre.querySelector('code')!.innerHTML;
  await highlightInto(pre, 'x = 1');
  expect(pre.querySelector('code')?.innerHTML).toBe(before);
  pre.remove();
});
