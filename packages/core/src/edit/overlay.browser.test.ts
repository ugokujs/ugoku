import { expect, test } from 'vitest';
import { createOverlay } from './overlay';

function createPre(): HTMLElement {
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = 'let x = 1;';
  pre.appendChild(code);
  document.body.appendChild(pre);
  return pre;
}

test('createOverlay appends a textarea with the overlay class as a child of pre', () => {
  const pre = createPre();
  const overlay = createOverlay(pre);

  expect(overlay.tagName).toBe('TEXTAREA');
  expect(overlay.className).toBe('ugoku-edit-overlay');
  expect(overlay.parentElement).toBe(pre);

  pre.remove();
});

test('createOverlay disables spellcheck and native autocomplete', () => {
  const pre = createPre();
  const overlay = createOverlay(pre);

  expect(overlay.spellcheck).toBe(false);
  expect(overlay.getAttribute('autocomplete')).toBe('off');

  pre.remove();
});
