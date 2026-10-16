import type { SerializedValue, ObjectEntry, MapEntry } from './types.ts';

// Embedded via .toString() into the worker bootstrap — must stay fully
// self-contained (no module-level helpers, no closures over anything
// outside this function's own body).
export function serializeValue(value: unknown): SerializedValue {
  const MAX_DEPTH = 2;
  const MAX_ITEMS = 100;
  const MAX_STRING_LENGTH = 10000;

  function serialize(value: unknown, depth: number, ancestors: Set<object>): SerializedValue {
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

    const obj = value as object;
    if (ancestors.has(obj)) return { kind: 'circular', label: '[Circular *1]' };

    if (Array.isArray(obj)) return serializeArray(obj, depth, ancestors);
    if (obj instanceof Map) return serializeMap(obj, depth, ancestors);
    if (obj instanceof Set) return serializeSet(obj, depth, ancestors);
    return serializeObject(obj, depth, ancestors);
  }

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

  function classNameOf(obj: object): string | null {
    const proto = Object.getPrototypeOf(obj);
    if (proto === null) return null;
    const ctor = proto.constructor;
    if (!ctor || ctor === Object) return null;
    return ctor.name || null;
  }

  function serializeArray(arr: unknown[], depth: number, ancestors: Set<object>): SerializedValue {
    if (depth >= MAX_DEPTH) {
      return { kind: 'array', preview: `Array(${arr.length})`, items: null, omittedCount: 0 };
    }
    ancestors.add(arr);
    const limited = arr.slice(0, MAX_ITEMS);
    const items = limited.map((item) => serialize(item, depth + 1, ancestors));
    ancestors.delete(arr);
    const omittedCount = Math.max(0, arr.length - MAX_ITEMS);
    return { kind: 'array', preview: buildArrayPreview(items, omittedCount), items, omittedCount };
  }

  function serializeObject(obj: object, depth: number, ancestors: Set<object>): SerializedValue {
    const className = classNameOf(obj);
    const keys = Object.keys(obj);
    if (depth >= MAX_DEPTH) {
      const preview = className ? `${className}(${keys.length})` : `Object(${keys.length})`;
      return { kind: 'object', preview, className, entries: null, omittedCount: 0 };
    }
    ancestors.add(obj);
    const limitedKeys = keys.slice(0, MAX_ITEMS);
    const entries: ObjectEntry[] = limitedKeys.map((key) => ({
      key,
      value: serialize((obj as Record<string, unknown>)[key], depth + 1, ancestors),
    }));
    ancestors.delete(obj);
    const omittedCount = Math.max(0, keys.length - MAX_ITEMS);
    return {
      kind: 'object',
      preview: buildObjectPreview(className, entries, omittedCount),
      className,
      entries,
      omittedCount,
    };
  }

  function serializeMap(map: Map<unknown, unknown>, depth: number, ancestors: Set<object>): SerializedValue {
    if (depth >= MAX_DEPTH) {
      return { kind: 'map', preview: `Map(${map.size})`, entries: null, omittedCount: 0 };
    }
    ancestors.add(map);
    const allEntries = Array.from(map.entries()).slice(0, MAX_ITEMS);
    const entries: MapEntry[] = allEntries.map(([key, value]) => ({
      key: serialize(key, depth + 1, ancestors),
      value: serialize(value, depth + 1, ancestors),
    }));
    ancestors.delete(map);
    const omittedCount = Math.max(0, map.size - MAX_ITEMS);
    return { kind: 'map', preview: buildMapPreview(entries, omittedCount), entries, omittedCount };
  }

  function serializeSet(set: Set<unknown>, depth: number, ancestors: Set<object>): SerializedValue {
    if (depth >= MAX_DEPTH) {
      return { kind: 'set', preview: `Set(${set.size})`, items: null, omittedCount: 0 };
    }
    ancestors.add(set);
    const allItems = Array.from(set.values()).slice(0, MAX_ITEMS);
    const items = allItems.map((item) => serialize(item, depth + 1, ancestors));
    ancestors.delete(set);
    const omittedCount = Math.max(0, set.size - MAX_ITEMS);
    return { kind: 'set', preview: buildSetPreview(items, omittedCount), items, omittedCount };
  }

  function previewOf(value: SerializedValue): string {
    switch (value.kind) {
      case 'primitive':
        return literalOf(value);
      case 'circular':
        return value.label;
      case 'promise':
        return 'Promise {<pending>}';
      case 'error':
        return `${value.name}: ${value.message}`;
      default:
        return value.preview;
    }
  }

  function literalOf(value: Extract<SerializedValue, { kind: 'primitive' }>): string {
    if (value.value === null) return 'null';
    if (value.value === undefined) return 'undefined';
    if (typeof value.value === 'string') {
      return JSON.stringify(value.truncatedChars ? `${value.value}…` : value.value);
    }
    return String(value.value);
  }

  function buildArrayPreview(items: SerializedValue[], omittedCount: number): string {
    const parts = items.map(previewOf);
    if (omittedCount > 0) parts.push(`… ${omittedCount} more`);
    return `[ ${parts.join(', ')} ]`;
  }

  function buildObjectPreview(className: string | null, entries: ObjectEntry[], omittedCount: number): string {
    const parts = entries.map((entry) => `${entry.key}: ${previewOf(entry.value)}`);
    if (omittedCount > 0) parts.push(`… ${omittedCount} more`);
    const prefix = className ? `${className} ` : '';
    return `${prefix}{ ${parts.join(', ')} }`;
  }

  function buildMapPreview(entries: MapEntry[], omittedCount: number): string {
    const parts = entries.map((entry) => `${previewOf(entry.key)} => ${previewOf(entry.value)}`);
    if (omittedCount > 0) parts.push(`… ${omittedCount} more`);
    return `Map(${entries.length + omittedCount}) { ${parts.join(', ')} }`;
  }

  function buildSetPreview(items: SerializedValue[], omittedCount: number): string {
    const parts = items.map(previewOf);
    if (omittedCount > 0) parts.push(`… ${omittedCount} more`);
    return `Set(${items.length + omittedCount}) { ${parts.join(', ')} }`;
  }

  return serialize(value, 0, new Set());
}
