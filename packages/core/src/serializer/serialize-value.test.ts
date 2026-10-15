import { expect, test } from 'vitest';
import { serializeValue } from './serialize-value';

test('serializes primitives unchanged', () => {
  expect(serializeValue('hi')).toEqual({ kind: 'primitive', value: 'hi' });
  expect(serializeValue(42)).toEqual({ kind: 'primitive', value: 42 });
  expect(serializeValue(true)).toEqual({ kind: 'primitive', value: true });
  expect(serializeValue(null)).toEqual({ kind: 'primitive', value: null });
  expect(serializeValue(undefined)).toEqual({ kind: 'primitive', value: undefined });
});

test('truncates long strings and records the omitted character count', () => {
  const long = 'x'.repeat(10005);
  expect(serializeValue(long)).toEqual({
    kind: 'primitive',
    value: 'x'.repeat(10000),
    truncatedChars: 5,
  });
});

test('serializes bigint, symbol, and function as special scalars', () => {
  expect(serializeValue(10n)).toEqual({ kind: 'bigint', preview: '10n' });
  expect(serializeValue(Symbol('x'))).toEqual({ kind: 'symbol', preview: 'Symbol(x)' });
  function namedFn() {}
  expect(serializeValue(namedFn)).toEqual({ kind: 'function', preview: '[Function: namedFn]' });
  expect(serializeValue(() => {})).toEqual({ kind: 'function', preview: '[Function (anonymous)]' });
});

test('serializes Date and RegExp as special scalars', () => {
  const date = new Date('2026-01-01T00:00:00.000Z');
  expect(serializeValue(date)).toEqual({ kind: 'date', preview: '2026-01-01T00:00:00.000Z' });
  expect(serializeValue(/abc/gi)).toEqual({ kind: 'regexp', preview: '/abc/gi' });
});

test('serializes Error as a name/message/stack node', () => {
  const error = new Error('boom');
  const result = serializeValue(error);
  expect(result).toMatchObject({ kind: 'error', name: 'Error', message: 'boom' });
  expect((result as { stack?: string }).stack).toContain('boom');
});

test('serializes a Promise as always-pending', () => {
  expect(serializeValue(Promise.resolve(1))).toEqual({ kind: 'promise' });
});

test('falls back to a placeholder object node for composites, for now', () => {
  expect(serializeValue({ a: 1 })).toEqual({
    kind: 'object',
    preview: '[Object]',
    className: null,
    entries: null,
    omittedCount: 0,
  });
});
