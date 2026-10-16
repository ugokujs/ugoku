import { expect, test } from 'vitest';
import { spliceHighlightedHtml } from './splice';

function createPre(): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'shiki original-theme';
  pre.setAttribute('style', 'background-color:#fff');
  pre.dataset.ugokuMode = 'run-edit';
  const code = document.createElement('code');
  code.innerHTML = '<span class="line">original</span>';
  pre.appendChild(code);
  document.body.appendChild(pre);
  return pre;
}

test('spliceHighlightedHtml unions classes (preserving the pre\'s own) and replaces style and code innerHTML', () => {
  const pre = createPre();
  const freshHtml =
    '<pre class="shiki new-theme" style="background-color:#000"><code><span class="line">updated</span></code></pre>';

  spliceHighlightedHtml(pre, freshHtml);

  // "original-theme" simulates a host-added class (e.g. VitePress's `vp-code`)
  // that shiki's raw rehighlight output never knows about — it must survive.
  expect(pre.className).toBe('shiki original-theme new-theme');
  expect(pre.getAttribute('style')).toBe('background-color:#000');
  expect(pre.querySelector('code')?.innerHTML).toBe('<span class="line">updated</span>');

  pre.remove();
});

test('spliceHighlightedHtml preserves data-ugoku-* attributes', () => {
  const pre = createPre();
  const freshHtml = '<pre class="shiki new-theme"><code><span class="line">updated</span></code></pre>';

  spliceHighlightedHtml(pre, freshHtml);

  expect(pre.dataset.ugokuMode).toBe('run-edit');

  pre.remove();
});

test('spliceHighlightedHtml removes the style attribute when the fresh markup has none', () => {
  const pre = createPre();
  const freshHtml = '<pre class="shiki new-theme"><code><span class="line">updated</span></code></pre>';

  spliceHighlightedHtml(pre, freshHtml);

  expect(pre.hasAttribute('style')).toBe(false);

  pre.remove();
});

test('spliceHighlightedHtml is a no-op when the fresh markup has no code element', () => {
  const pre = createPre();
  const originalInnerHTML = pre.querySelector('code')!.innerHTML;

  spliceHighlightedHtml(pre, '<div>not a pre/code structure</div>');

  expect(pre.querySelector('code')?.innerHTML).toBe(originalInnerHTML);

  pre.remove();
});
