import { expect, test } from 'vitest';
import { renderValue } from './render-value';
import type { SerializedValue } from '../serializer/types';

test('renders a primitive string with quotes', () => {
  const el = renderValue({ kind: 'primitive', value: 'hi' });
  expect(el.textContent).toBe('"hi"');
  expect(el.className).toBe('ugoku-string');
});

test('renders a truncated string with a character count suffix', () => {
  const el = renderValue({ kind: 'primitive', value: 'ab', truncatedChars: 3 });
  expect(el.textContent).toBe('"ab"… (3 more characters)');
});

test('renders null and undefined distinctly', () => {
  expect(renderValue({ kind: 'primitive', value: null }).textContent).toBe('null');
  expect(renderValue({ kind: 'primitive', value: undefined }).textContent).toBe('undefined');
});

test('renders a depth-limited composite as plain non-expandable text', () => {
  const value: SerializedValue = { kind: 'array', preview: 'Array(2)', items: null, omittedCount: 0 };
  const el = renderValue(value);
  expect(el.textContent).toBe('Array(2)');
  expect(el.querySelector('.ugoku-toggle')).toBeNull();
});

test('renders a composite collapsed by default, expanding and collapsing on click', () => {
  const value: SerializedValue = {
    kind: 'object',
    preview: '{ a: 1 }',
    className: null,
    entries: [{ key: 'a', value: { kind: 'primitive', value: 1 } }],
    omittedCount: 0,
  };
  const el = renderValue(value);
  document.body.appendChild(el);

  const preview = el.querySelector('.ugoku-preview') as HTMLElement;
  expect(preview.hidden).toBe(false);
  expect(el.querySelector('.ugoku-expanded')).toBeNull();

  el.click();

  expect(preview.hidden).toBe(true);
  const expanded = el.querySelector('.ugoku-expanded') as HTMLElement;
  expect(expanded).not.toBeNull();
  expect(expanded.hidden).toBe(false);
  expect(expanded.textContent).toContain('a: ');
  expect(expanded.textContent).toContain('1');

  el.click();
  expect(preview.hidden).toBe(false);
  expect(expanded.hidden).toBe(true);

  document.body.removeChild(el);
});

test('expanding a nested composite does not collapse its ancestor', () => {
  const value: SerializedValue = {
    kind: 'object',
    preview: '{ a: { b: 1 } }',
    className: null,
    entries: [
      {
        key: 'a',
        value: {
          kind: 'object',
          preview: '{ b: 1 }',
          className: null,
          entries: [{ key: 'b', value: { kind: 'primitive', value: 1 } }],
          omittedCount: 0,
        },
      },
    ],
    omittedCount: 0,
  };
  const outer = renderValue(value);
  document.body.appendChild(outer);

  const outerPreview = outer.querySelector(':scope > .ugoku-preview') as HTMLElement;
  outer.click();
  expect(outerPreview.hidden).toBe(true);

  const outerExpanded = outer.querySelector(':scope > .ugoku-expanded') as HTMLElement;
  const inner = outerExpanded.querySelector('.ugoku-composite') as HTMLElement;
  const innerPreview = inner.querySelector(':scope > .ugoku-preview') as HTMLElement;

  inner.click();

  expect(innerPreview.hidden).toBe(true);
  expect(outerPreview.hidden).toBe(true);
  expect(inner.querySelector(':scope > .ugoku-expanded')).not.toBeNull();

  document.body.removeChild(outer);
});

test('renders a circular reference and a pending promise as plain text', () => {
  expect(renderValue({ kind: 'circular', label: '[Circular *1]' }).textContent).toBe('[Circular *1]');
  expect(renderValue({ kind: 'promise' }).textContent).toBe('Promise {<pending>}');
});

test('renders an Error with its stack trace', () => {
  const el = renderValue({ kind: 'error', name: 'Error', message: 'boom', stack: 'Error: boom\n at x' });
  expect(el.querySelector('.ugoku-error-header')?.textContent).toBe('Error: boom');
  expect(el.querySelector('.ugoku-error-stack')?.textContent).toBe('Error: boom\n at x');
});
