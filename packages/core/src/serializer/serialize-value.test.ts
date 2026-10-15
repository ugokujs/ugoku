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

test('serializes arrays and plain objects with real entries', () => {
  expect(serializeValue([1, 'a', true])).toEqual({
    kind: 'array',
    preview: '[ 1, "a", true ]',
    items: [
      { kind: 'primitive', value: 1 },
      { kind: 'primitive', value: 'a' },
      { kind: 'primitive', value: true },
    ],
    omittedCount: 0,
  });

  expect(serializeValue({ a: 1, b: 'x' })).toEqual({
    kind: 'object',
    preview: '{ a: 1, b: "x" }',
    className: null,
    entries: [
      { key: 'a', value: { kind: 'primitive', value: 1 } },
      { key: 'b', value: { kind: 'primitive', value: 'x' } },
    ],
    omittedCount: 0,
  });
});

test('serializes Map and Set with real entries', () => {
  expect(serializeValue(new Map([['a', 1]]))).toEqual({
    kind: 'map',
    preview: 'Map(1) { "a" => 1 }',
    entries: [{ key: { kind: 'primitive', value: 'a' }, value: { kind: 'primitive', value: 1 } }],
    omittedCount: 0,
  });

  expect(serializeValue(new Set([1, 2]))).toEqual({
    kind: 'set',
    preview: 'Set(2) { 1, 2 }',
    items: [
      { kind: 'primitive', value: 1 },
      { kind: 'primitive', value: 2 },
    ],
    omittedCount: 0,
  });
});

test('prefixes class instance previews with the constructor name', () => {
  class Point {
    constructor(public x: number, public y: number) {}
  }
  const result = serializeValue(new Point(1, 2));
  expect(result).toMatchObject({ kind: 'object', className: 'Point', preview: 'Point { x: 1, y: 2 }' });
});

test('treats Object.create(null) as a plain object with no class name', () => {
  const obj = Object.create(null);
  obj.a = 1;
  const result = serializeValue(obj);
  expect(result).toMatchObject({ kind: 'object', className: null });
});

test('caps nesting at maxDepth, showing a terse type+count summary beyond it', () => {
  const nested = { user: { name: 'Sam', roles: ['admin', 'ed'] } };
  const result = serializeValue(nested) as {
    preview: string;
    entries: Array<{ key: string; value: { entries: Array<{ key: string; value: unknown }> } }>;
  };
  expect(result.preview).toBe('{ user: { name: "Sam", roles: Array(2) } }');

  const userEntry = result.entries[0];
  expect(userEntry.key).toBe('user');
  const rolesEntry = userEntry.value.entries[1];
  expect(rolesEntry.value).toEqual({ kind: 'array', preview: 'Array(2)', items: null, omittedCount: 0 });
});

test('truncates arrays beyond maxItems and records omittedCount in both items and preview', () => {
  const bigArray = Array.from({ length: 105 }, (_, i) => i);
  const result = serializeValue(bigArray) as { items: unknown[] | null; omittedCount: number; preview: string };
  expect(result.items).toHaveLength(100);
  expect(result.omittedCount).toBe(5);
  expect(result.preview.endsWith('… 5 more ]')).toBe(true);
});

test('detects circular references without infinite recursion', () => {
  const obj: Record<string, unknown> = { a: 1 };
  obj.self = obj;
  const result = serializeValue(obj);
  expect(result).toMatchObject({
    kind: 'object',
    entries: [
      { key: 'a', value: { kind: 'primitive', value: 1 } },
      { key: 'self', value: { kind: 'circular', label: '[Circular *1]' } },
    ],
  });
});

test('does not flag the same object appearing twice in unrelated branches as circular', () => {
  const shared = { x: 1 };
  const result = serializeValue({ a: shared, b: shared });
  expect(result).toMatchObject({
    entries: [
      { key: 'a', value: { kind: 'object', entries: [{ key: 'x', value: { kind: 'primitive', value: 1 } }] } },
      { key: 'b', value: { kind: 'object', entries: [{ key: 'x', value: { kind: 'primitive', value: 1 } }] } },
    ],
  });
});
