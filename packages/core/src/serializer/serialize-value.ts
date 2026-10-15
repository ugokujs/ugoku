import type { SerializedValue } from './types';

// Embedded via .toString() into the worker bootstrap — must stay fully
// self-contained (no module-level helpers, no closures over anything
// outside this function's own body).
export function serializeValue(value: unknown): SerializedValue {
  const MAX_STRING_LENGTH = 10000;

  function serializeString(value: string): SerializedValue {
    if (value.length <= MAX_STRING_LENGTH) return { kind: 'primitive', value };
    return {
      kind: 'primitive',
      value: value.slice(0, MAX_STRING_LENGTH),
      truncatedChars: value.length - MAX_STRING_LENGTH,
    };
  }

  function functionPreview(fn: (...args: unknown[]) => unknown): string {
    return fn.name ? `[Function: ${fn.name}]` : '[Function (anonymous)]';
  }

  if (value === null) return { kind: 'primitive', value: null };
  if (value === undefined) return { kind: 'primitive', value: undefined };

  const type = typeof value;

  if (type === 'string') return serializeString(value as string);
  if (type === 'number' || type === 'boolean') {
    return { kind: 'primitive', value: value as number | boolean };
  }
  if (type === 'bigint') return { kind: 'bigint', preview: `${value}n` };
  if (type === 'symbol') return { kind: 'symbol', preview: (value as symbol).toString() };
  if (type === 'function') {
    return { kind: 'function', preview: functionPreview(value as (...args: unknown[]) => unknown) };
  }

  if (value instanceof Error) {
    return { kind: 'error', name: value.name, message: value.message, stack: value.stack };
  }
  if (value instanceof Promise) return { kind: 'promise' };
  if (value instanceof Date) return { kind: 'date', preview: value.toISOString() };
  if (value instanceof RegExp) return { kind: 'regexp', preview: value.toString() };

  return { kind: 'object', preview: '[Object]', className: null, entries: null, omittedCount: 0 };
}
