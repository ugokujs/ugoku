import { expect, test } from 'vitest';
import { serializeValue } from './serialize-value';

test('passes primitives through unchanged', () => {
  expect(serializeValue('hi')).toEqual({ kind: 'primitive', value: 'hi' });
  expect(serializeValue(42)).toEqual({ kind: 'primitive', value: 42 });
  expect(serializeValue(true)).toEqual({ kind: 'primitive', value: true });
  expect(serializeValue(null)).toEqual({ kind: 'primitive', value: null });
  expect(serializeValue(undefined)).toEqual({ kind: 'primitive', value: undefined });
});

test('falls back to a string preview for everything else', () => {
  expect(serializeValue({ a: 1 })).toEqual({ kind: 'placeholder', preview: '[object Object]' });
  expect(serializeValue([1, 2])).toEqual({ kind: 'placeholder', preview: '1,2' });
  expect(serializeValue(new Error('boom'))).toEqual({ kind: 'placeholder', preview: 'Error: boom' });
});
