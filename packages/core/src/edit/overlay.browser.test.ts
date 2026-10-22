import { expect, test } from 'vitest';
import { createOverlay, syncOverlayFallbacks } from './overlay';

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

test('syncOverlayFallbacks copies the real rendered font metrics and colors from pre/code onto the overlay as CSS custom properties', () => {
  const pre = document.createElement('pre');
  pre.style.backgroundColor = 'rgb(36, 41, 46)';
  pre.style.color = 'rgb(225, 228, 232)';

  const code = document.createElement('code');
  code.style.fontFamily = 'Menlo, monospace';
  code.style.fontSize = '13px';
  code.style.lineHeight = '20px';
  code.textContent = 'let x = 1;';
  pre.appendChild(code);
  document.body.appendChild(pre);

  const overlay = createOverlay(pre);
  syncOverlayFallbacks(pre, overlay);

  expect(overlay.style.getPropertyValue('--ugoku-color-edit-bg')).toBe('rgb(36, 41, 46)');
  expect(overlay.style.getPropertyValue('--ugoku-color-edit-text')).toBe('rgb(225, 228, 232)');
  expect(overlay.style.getPropertyValue('--ugoku-font-edit-family')).toBe('Menlo, monospace');
  expect(overlay.style.getPropertyValue('--ugoku-font-edit-size')).toBe('13px');
  expect(overlay.style.getPropertyValue('--ugoku-font-edit-line-height')).toBe('20px');

  pre.remove();
});

test("syncOverlayFallbacks sums pre's and code's real padding onto the overlay, so edit mode doesn't shift text that a host (e.g. VitePress) splits padding for between the two elements", () => {
  const pre = document.createElement('pre');
  pre.style.padding = '20px 0px';

  const code = document.createElement('code');
  code.style.padding = '0px 24px';
  code.textContent = 'let x = 1;';
  pre.appendChild(code);
  document.body.appendChild(pre);

  const overlay = createOverlay(pre);
  syncOverlayFallbacks(pre, overlay);

  expect(overlay.style.getPropertyValue('--ugoku-padding-edit-top')).toBe('20px');
  expect(overlay.style.getPropertyValue('--ugoku-padding-edit-right')).toBe('24px');
  expect(overlay.style.getPropertyValue('--ugoku-padding-edit-bottom')).toBe('20px');
  expect(overlay.style.getPropertyValue('--ugoku-padding-edit-left')).toBe('24px');

  pre.remove();
});
