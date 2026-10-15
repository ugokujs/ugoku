import type { SerializedValue } from './protocol';

export function serializeValue(value: unknown): SerializedValue {
  if (value === null) return { kind: 'primitive', value: null };
  if (value === undefined) return { kind: 'primitive', value: undefined };
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return { kind: 'primitive', value: value as string | number | boolean };
  }
  return { kind: 'placeholder', preview: String(value) };
}
