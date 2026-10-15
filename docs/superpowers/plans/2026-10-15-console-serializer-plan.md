# Console Serializer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the placeholder `SerializedValue` type with the real `util.inspect`-style display tree from `docs/superpowers/specs/2026-10-15-console-serializer-design.md`, wire it into the existing worker runtime, and build the vanilla-DOM output panel that renders it with collapse/expand.

**Architecture:** A new `packages/core/src/serializer/` module owns the `SerializedValue` tree type and the recursive build algorithm. A new `packages/core/src/output-panel/` module owns DOM rendering (collapsible composites, color-coded scalars, auto-scroll). The existing `packages/core/src/runner/` module is rewired to consume the new serializer in place of today's placeholder, with no change to the message envelope itself.

**Tech Stack:** TypeScript, the existing pnpm/Vitest/Playwright (Chromium) toolchain. No new dependencies, no bundler step.

## Global Constraints

- Keep comments to a minimum — only where a non-obvious WHY needs explaining.
- `serializeValue` must remain a single, fully self-contained function (every helper nested as a local function inside it, no module-level helpers, no closures over anything outside its own body) — it is embedded into the worker bootstrap via `.toString()`, and anything it references outside itself becomes a dangling reference at runtime inside the worker.
- Default limits, exact values from the spec: `maxDepth = 2`, `maxItems = 100`, `maxStringLength = 10000`.
- Vanilla DOM only for the output panel — no framework dependency.
- `ConsoleMessage.args: SerializedValue[]` keeps its field name and position in `protocol.ts`; `ErrorMessage.error: SerializedError` (the flat run-level-failure shape) is unchanged by this plan.

---

## File Structure

```
packages/core/src/serializer/types.ts
packages/core/src/serializer/serialize-value.ts
packages/core/src/serializer/serialize-value.test.ts
packages/core/src/runner/protocol.ts                      # modified
packages/core/src/runner/worker-source.ts                  # modified
packages/core/src/runner/worker-source.browser.test.ts     # modified
packages/core/src/runner/serialize-value.ts                 # deleted
packages/core/src/runner/serialize-value.test.ts             # deleted
packages/core/src/output-panel/render-value.ts
packages/core/src/output-panel/render-value.browser.test.ts
packages/core/src/output-panel/output-panel.ts
packages/core/src/output-panel/output-panel.browser.test.ts
packages/core/src/output-panel/styles.css
packages/core/src/output-panel/index.ts
```

---

### Task 1: SerializedValue types + scalar serialization

**Files:**
- Create: `packages/core/src/serializer/types.ts`
- Create: `packages/core/src/serializer/serialize-value.ts`
- Test: `packages/core/src/serializer/serialize-value.test.ts`

**Interfaces:**
- Consumes: nothing beyond the existing toolchain.
- Produces: `SerializedValue` (full discriminated union, all 13 `kind` variants — composites included, even though this task only implements the scalar ones) plus `ObjectEntry`/`MapEntry` sub-types, from `types.ts`. `serializeValue(value: unknown): SerializedValue` from `serialize-value.ts`, handling every scalar kind correctly and returning a temporary non-recursive placeholder (`{ kind: 'object', preview: '[Object]', className: null, entries: null, omittedCount: 0 }`) for arrays/objects/maps/sets — Task 2 replaces that placeholder with real composite handling.

- [ ] **Step 1: Write the types**

`packages/core/src/serializer/types.ts`:
```ts
export interface PrimitiveValue {
  kind: 'primitive';
  value: string | number | boolean | null | undefined;
  truncatedChars?: number;
}

export interface SpecialScalarValue {
  kind: 'bigint' | 'symbol' | 'function' | 'date' | 'regexp';
  preview: string;
}

export interface ObjectEntry {
  key: string;
  value: SerializedValue;
}

export interface ArrayValue {
  kind: 'array';
  preview: string;
  items: SerializedValue[] | null;
  omittedCount: number;
}

export interface ObjectValue {
  kind: 'object';
  preview: string;
  className: string | null;
  entries: ObjectEntry[] | null;
  omittedCount: number;
}

export interface MapEntry {
  key: SerializedValue;
  value: SerializedValue;
}

export interface MapValue {
  kind: 'map';
  preview: string;
  entries: MapEntry[] | null;
  omittedCount: number;
}

export interface SetValue {
  kind: 'set';
  preview: string;
  items: SerializedValue[] | null;
  omittedCount: number;
}

export interface ErrorValue {
  kind: 'error';
  name: string;
  message: string;
  stack?: string;
}

export interface PromiseValue {
  kind: 'promise';
}

export interface CircularValue {
  kind: 'circular';
  label: string;
}

export type SerializedValue =
  | PrimitiveValue
  | SpecialScalarValue
  | ArrayValue
  | ObjectValue
  | MapValue
  | SetValue
  | ErrorValue
  | PromiseValue
  | CircularValue;
```

- [ ] **Step 2: Write the failing test**

`packages/core/src/serializer/serialize-value.test.ts`:
```ts
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test serialize-value`
Expected: FAIL — `serialize-value.ts` does not exist yet.

- [ ] **Step 4: Write the implementation**

`packages/core/src/serializer/serialize-value.ts`:
```ts
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test serialize-value`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/serializer/types.ts packages/core/src/serializer/serialize-value.ts packages/core/src/serializer/serialize-value.test.ts
git commit -m "feat: add SerializedValue tree types and scalar serialization"
```

---

### Task 2: Composite serialization (arrays, objects, maps, sets)

**Files:**
- Modify: `packages/core/src/serializer/serialize-value.ts`
- Modify: `packages/core/src/serializer/serialize-value.test.ts`

**Interfaces:**
- Consumes: `SerializedValue`, `ObjectEntry`, `MapEntry` from `./types` (Task 1); extends Task 1's `serializeValue` — same exported signature, same self-containment constraint.
- Produces: the complete `serializeValue(value: unknown): SerializedValue`, now fully implementing every kind. This is what Task 3 embeds into the worker and Tasks 4/5 render.

- [ ] **Step 1: Replace the placeholder test with composite tests**

Replace the last test in `packages/core/src/serializer/serialize-value.test.ts` (`'falls back to a placeholder object node for composites, for now'`) and append these:
```ts
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
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `pnpm test serialize-value`
Expected: FAIL — composites still return the Task 1 placeholder shape.

- [ ] **Step 3: Replace the implementation**

Replace the full contents of `packages/core/src/serializer/serialize-value.ts` with:
```ts
import type { SerializedValue, ObjectEntry, MapEntry } from './types';

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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test serialize-value`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/serializer/serialize-value.ts packages/core/src/serializer/serialize-value.test.ts
git commit -m "feat: implement composite serialization (arrays, objects, maps, sets)"
```

---

### Task 3: Wire the real serializer into the worker runtime

**Files:**
- Modify: `packages/core/src/runner/protocol.ts`
- Modify: `packages/core/src/runner/worker-source.ts`
- Modify: `packages/core/src/runner/worker-source.browser.test.ts`
- Delete: `packages/core/src/runner/serialize-value.ts`
- Delete: `packages/core/src/runner/serialize-value.test.ts`

**Interfaces:**
- Consumes: `SerializedValue` and `serializeValue` from `../serializer/*` (Tasks 1–2).
- Produces: nothing new — this task rewires existing consumers (`protocol.ts`'s `ConsoleMessage.args`, `worker-source.ts`'s embedded serializer) to the real implementation. `index.ts` and `run-code.ts` need no changes: they only reference `SerializedValue` by name, which keeps resolving.

- [ ] **Step 1: Point protocol.ts at the new SerializedValue**

Replace the full contents of `packages/core/src/runner/protocol.ts` with:
```ts
import type { SerializedValue } from '../serializer/types';

export type { SerializedValue };

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

export interface RunMessage {
  type: 'run';
  runId: string;
  source: string;
  timeoutMs: number;
}

export interface ConsoleMessage {
  type: 'console';
  runId: string;
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: SerializedValue[];
}

export interface DoneMessage {
  type: 'done';
  runId: string;
}

export interface ErrorMessage {
  type: 'error';
  runId: string;
  error: SerializedError;
}

export type MainToWorkerMessage = RunMessage;
export type WorkerToMainMessage = ConsoleMessage | DoneMessage | ErrorMessage;
```

- [ ] **Step 2: Point worker-source.ts at the new serializer**

In `packages/core/src/runner/worker-source.ts`, change the import line from:
```ts
import { serializeValue } from './serialize-value';
```
to:
```ts
import { serializeValue } from '../serializer/serialize-value';
```
No other change to this file — the rest of the generated script template is unaffected.

- [ ] **Step 3: Delete the superseded placeholder files**

```bash
rm packages/core/src/runner/serialize-value.ts packages/core/src/runner/serialize-value.test.ts
```

- [ ] **Step 4: Update the worker-source test that asserted the old placeholder shape**

In `packages/core/src/runner/worker-source.browser.test.ts`, replace the test named `'serializes non-primitive console args as placeholder previews'` with:
```ts
test('serializes non-primitive console args using the real serializer', async () => {
  const worker = createTestWorker();
  const messages: unknown[] = [];

  await new Promise<void>((resolve) => {
    worker.onmessage = (event) => {
      messages.push(event.data);
      if ((event.data as { type: string }).type === 'done') resolve();
    };
    worker.postMessage({
      type: 'run',
      runId: 'test-5',
      source: `console.log({ a: 1 }, [1, 2])`,
      timeoutMs: 1000,
    });
  });

  worker.terminate();
  expect(messages).toEqual([
    {
      type: 'console',
      runId: 'test-5',
      level: 'log',
      args: [
        {
          kind: 'object',
          preview: '{ a: 1 }',
          className: null,
          entries: [{ key: 'a', value: { kind: 'primitive', value: 1 } }],
          omittedCount: 0,
        },
        {
          kind: 'array',
          preview: '[ 1, 2 ]',
          items: [
            { kind: 'primitive', value: 1 },
            { kind: 'primitive', value: 2 },
          ],
          omittedCount: 0,
        },
      ],
    },
    { type: 'done', runId: 'test-5' },
  ]);
});
```

This test is the critical regression guard for the self-containment constraint: it proves the real (much larger) `serializeValue` still survives `.toString()` embedding into an actual worker for composite values, not just primitives.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm test`
Expected: all test files PASS, no regressions.

Run: `pnpm typecheck`
Expected: clean, no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/runner/protocol.ts packages/core/src/runner/worker-source.ts packages/core/src/runner/worker-source.browser.test.ts
git rm packages/core/src/runner/serialize-value.ts packages/core/src/runner/serialize-value.test.ts
git commit -m "feat: wire the real console serializer into the worker runtime"
```

---

### Task 4: Output panel value renderer

**Files:**
- Create: `packages/core/src/output-panel/render-value.ts`
- Test: `packages/core/src/output-panel/render-value.browser.test.ts`

**Interfaces:**
- Consumes: `SerializedValue` from `../serializer/types` (Tasks 1–2).
- Produces: `renderValue(value: SerializedValue): HTMLElement`, used by Task 5's `OutputPanel`.

This task runs in the browser-mode test environment (real DOM), since it manipulates actual `HTMLElement`s and dispatches real click events. No self-containment constraint here — this file runs directly on the main thread, never embedded into the worker.

- [ ] **Step 1: Write the failing tests**

`packages/core/src/output-panel/render-value.browser.test.ts`:
```ts
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

test('renders a circular reference and a pending promise as plain text', () => {
  expect(renderValue({ kind: 'circular', label: '[Circular *1]' }).textContent).toBe('[Circular *1]');
  expect(renderValue({ kind: 'promise' }).textContent).toBe('Promise {<pending>}');
});

test('renders an Error with its stack trace', () => {
  const el = renderValue({ kind: 'error', name: 'Error', message: 'boom', stack: 'Error: boom\n at x' });
  expect(el.querySelector('.ugoku-error-header')?.textContent).toBe('Error: boom');
  expect(el.querySelector('.ugoku-error-stack')?.textContent).toBe('Error: boom\n at x');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test render-value`
Expected: FAIL — `render-value.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

`packages/core/src/output-panel/render-value.ts`:
```ts
import type { SerializedValue, ObjectEntry, MapEntry } from '../serializer/types';

export function renderValue(value: SerializedValue): HTMLElement {
  switch (value.kind) {
    case 'primitive':
      return renderPrimitive(value);
    case 'bigint':
    case 'symbol':
    case 'function':
    case 'date':
    case 'regexp':
      return renderPlainText(value.preview, 'ugoku-special');
    case 'error':
      return renderError(value);
    case 'promise':
      return renderPlainText('Promise {<pending>}', 'ugoku-special');
    case 'circular':
      return renderPlainText(value.label, 'ugoku-punctuation');
    case 'array':
      return renderArray(value);
    case 'object':
      return renderObject(value);
    case 'map':
      return renderMap(value);
    case 'set':
      return renderSet(value);
  }
}

function renderPlainText(text: string, className: string): HTMLElement {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function renderPrimitive(value: Extract<SerializedValue, { kind: 'primitive' }>): HTMLElement {
  const span = document.createElement('span');
  if (value.value === null) {
    span.className = 'ugoku-null';
    span.textContent = 'null';
  } else if (value.value === undefined) {
    span.className = 'ugoku-null';
    span.textContent = 'undefined';
  } else if (typeof value.value === 'string') {
    span.className = 'ugoku-string';
    const suffix = value.truncatedChars ? `… (${value.truncatedChars} more characters)` : '';
    span.textContent = JSON.stringify(value.value) + suffix;
  } else if (typeof value.value === 'boolean') {
    span.className = 'ugoku-boolean';
    span.textContent = String(value.value);
  } else {
    span.className = 'ugoku-number';
    span.textContent = String(value.value);
  }
  return span;
}

function renderError(value: Extract<SerializedValue, { kind: 'error' }>): HTMLElement {
  const container = document.createElement('span');
  container.className = 'ugoku-error';

  const header = document.createElement('span');
  header.className = 'ugoku-error-header';
  header.textContent = `${value.name}: ${value.message}`;
  container.appendChild(header);

  if (value.stack) {
    const stack = document.createElement('pre');
    stack.className = 'ugoku-error-stack';
    stack.textContent = value.stack;
    container.appendChild(stack);
  }

  return container;
}

function createExpandable(preview: string, buildExpanded: () => HTMLElement): HTMLElement {
  const container = document.createElement('span');
  container.className = 'ugoku-composite';

  const toggle = document.createElement('span');
  toggle.className = 'ugoku-toggle';
  toggle.textContent = '▸';

  const previewEl = document.createElement('span');
  previewEl.className = 'ugoku-preview';
  previewEl.textContent = preview;

  container.append(toggle, previewEl);

  let expanded = false;
  let expandedEl: HTMLElement | null = null;

  container.addEventListener('click', () => {
    expanded = !expanded;
    toggle.textContent = expanded ? '▾' : '▸';
    previewEl.hidden = expanded;
    if (expanded) {
      if (!expandedEl) {
        expandedEl = buildExpanded();
        container.appendChild(expandedEl);
      }
      expandedEl.hidden = false;
    } else if (expandedEl) {
      expandedEl.hidden = true;
    }
  });

  return container;
}

function renderArray(value: Extract<SerializedValue, { kind: 'array' }>): HTMLElement {
  if (value.items === null) return renderPlainText(value.preview, 'ugoku-preview');
  const items = value.items;
  const omittedCount = value.omittedCount;
  return createExpandable(value.preview, () => {
    const list = document.createElement('span');
    list.className = 'ugoku-expanded ugoku-array-expanded';
    list.append('[ ');
    items.forEach((item, index) => {
      if (index > 0) list.append(', ');
      list.appendChild(renderValue(item));
    });
    if (omittedCount > 0) list.append(`, … ${omittedCount} more`);
    list.append(' ]');
    return list;
  });
}

function renderSet(value: Extract<SerializedValue, { kind: 'set' }>): HTMLElement {
  if (value.items === null) return renderPlainText(value.preview, 'ugoku-preview');
  const items = value.items;
  const omittedCount = value.omittedCount;
  return createExpandable(value.preview, () => {
    const list = document.createElement('span');
    list.className = 'ugoku-expanded ugoku-set-expanded';
    list.append(`Set(${items.length + omittedCount}) { `);
    items.forEach((item, index) => {
      if (index > 0) list.append(', ');
      list.appendChild(renderValue(item));
    });
    if (omittedCount > 0) list.append(`, … ${omittedCount} more`);
    list.append(' }');
    return list;
  });
}

function renderObject(value: Extract<SerializedValue, { kind: 'object' }>): HTMLElement {
  if (value.entries === null) return renderPlainText(value.preview, 'ugoku-preview');
  const entries: ObjectEntry[] = value.entries;
  const omittedCount = value.omittedCount;
  const className = value.className;
  return createExpandable(value.preview, () => {
    const list = document.createElement('span');
    list.className = 'ugoku-expanded ugoku-object-expanded';
    if (className) {
      const classEl = document.createElement('span');
      classEl.className = 'ugoku-class-name';
      classEl.textContent = `${className} `;
      list.appendChild(classEl);
    }
    list.append('{ ');
    entries.forEach((entry, index) => {
      if (index > 0) list.append(', ');
      const keyEl = document.createElement('span');
      keyEl.className = 'ugoku-key';
      keyEl.textContent = `${entry.key}: `;
      list.appendChild(keyEl);
      list.appendChild(renderValue(entry.value));
    });
    if (omittedCount > 0) list.append(`, … ${omittedCount} more`);
    list.append(' }');
    return list;
  });
}

function renderMap(value: Extract<SerializedValue, { kind: 'map' }>): HTMLElement {
  if (value.entries === null) return renderPlainText(value.preview, 'ugoku-preview');
  const entries: MapEntry[] = value.entries;
  const omittedCount = value.omittedCount;
  return createExpandable(value.preview, () => {
    const list = document.createElement('span');
    list.className = 'ugoku-expanded ugoku-map-expanded';
    list.append(`Map(${entries.length + omittedCount}) { `);
    entries.forEach((entry, index) => {
      if (index > 0) list.append(', ');
      list.appendChild(renderValue(entry.key));
      list.append(' => ');
      list.appendChild(renderValue(entry.value));
    });
    if (omittedCount > 0) list.append(`, … ${omittedCount} more`);
    list.append(' }');
    return list;
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test render-value`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/output-panel/render-value.ts packages/core/src/output-panel/render-value.browser.test.ts
git commit -m "feat: add output panel value renderer with collapse/expand"
```

---

### Task 5: Output panel container, auto-scroll, and styles

**Files:**
- Create: `packages/core/src/output-panel/output-panel.ts`
- Test: `packages/core/src/output-panel/output-panel.browser.test.ts`
- Create: `packages/core/src/output-panel/styles.css`
- Create: `packages/core/src/output-panel/index.ts`

**Interfaces:**
- Consumes: `renderValue` from `./render-value` (Task 4); `ConsoleMessage`, `SerializedError` from `../runner/protocol` (unchanged names, Task 3).
- Produces: `OutputPanel` class with `element: HTMLElement`, `appendConsole(message): void`, `appendError(error): void` — the public surface a future UI/mount layer will drive.

- [ ] **Step 1: Write the failing tests**

`packages/core/src/output-panel/output-panel.browser.test.ts`:
```ts
import { expect, test } from 'vitest';
import { OutputPanel } from './output-panel';

function mountWithFixedHeight(panel: OutputPanel): () => void {
  panel.element.style.height = '100px';
  panel.element.style.overflow = 'auto';
  document.body.appendChild(panel.element);
  return () => document.body.removeChild(panel.element);
}

test('appends a console message as a line with a level class', () => {
  const panel = new OutputPanel();
  panel.appendConsole({ level: 'log', args: [{ kind: 'primitive', value: 'hi' }] });
  const line = panel.element.querySelector('.ugoku-line-log');
  expect(line?.textContent).toBe('"hi"');
});

test('appends a run error with a banner and stack trace', () => {
  const panel = new OutputPanel();
  panel.appendError({ name: 'Error', message: 'boom', stack: 'Error: boom\n at x' });
  const line = panel.element.querySelector('.ugoku-line-run-error');
  expect(line?.querySelector('.ugoku-run-error-banner')?.textContent).toBe('run failed');
  expect(line?.querySelector('.ugoku-error-header')?.textContent).toBe('Error: boom');
});

test('auto-scrolls to the bottom as lines are appended while already at the bottom', () => {
  const panel = new OutputPanel();
  const cleanup = mountWithFixedHeight(panel);

  for (let i = 0; i < 20; i++) {
    panel.appendConsole({ level: 'log', args: [{ kind: 'primitive', value: `line ${i}` }] });
  }

  expect(panel.element.scrollTop).toBeGreaterThan(0);
  expect(panel.element.scrollHeight - panel.element.scrollTop - panel.element.clientHeight).toBeLessThanOrEqual(4);

  cleanup();
});

test('stops auto-scrolling once the reader scrolls away from the bottom', () => {
  const panel = new OutputPanel();
  const cleanup = mountWithFixedHeight(panel);

  for (let i = 0; i < 20; i++) {
    panel.appendConsole({ level: 'log', args: [{ kind: 'primitive', value: `line ${i}` }] });
  }

  panel.element.scrollTop = 0;

  for (let i = 20; i < 40; i++) {
    panel.appendConsole({ level: 'log', args: [{ kind: 'primitive', value: `line ${i}` }] });
  }

  expect(panel.element.scrollTop).toBe(0);

  cleanup();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test output-panel`
Expected: FAIL — `output-panel.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

`packages/core/src/output-panel/output-panel.ts`:
```ts
import { renderValue } from './render-value';
import type { ConsoleMessage, SerializedError } from '../runner/protocol';

export class OutputPanel {
  readonly element: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'ugoku-output-panel';
  }

  appendConsole(message: Pick<ConsoleMessage, 'level' | 'args'>): void {
    const line = document.createElement('div');
    line.className = `ugoku-line ugoku-line-${message.level}`;
    message.args.forEach((arg, index) => {
      if (index > 0) line.append(' ');
      line.appendChild(renderValue(arg));
    });
    this.appendLine(line);
  }

  appendError(error: SerializedError): void {
    const line = document.createElement('div');
    line.className = 'ugoku-line ugoku-line-run-error';

    const banner = document.createElement('span');
    banner.className = 'ugoku-run-error-banner';
    banner.textContent = 'run failed';
    line.appendChild(banner);

    line.appendChild(
      renderValue({ kind: 'error', name: error.name, message: error.message, stack: error.stack }),
    );
    this.appendLine(line);
  }

  private appendLine(line: HTMLElement): void {
    const wasAtBottom = this.isAtBottom();
    this.element.appendChild(line);
    if (wasAtBottom) this.scrollToBottom();
  }

  private isAtBottom(): boolean {
    const threshold = 4;
    return this.element.scrollHeight - this.element.scrollTop - this.element.clientHeight <= threshold;
  }

  private scrollToBottom(): void {
    this.element.scrollTop = this.element.scrollHeight;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test output-panel`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the stylesheet**

`packages/core/src/output-panel/styles.css`:
```css
.ugoku-output-panel {
  font-family: var(--ugoku-font-mono, ui-monospace, monospace);
  font-size: 0.875em;
  white-space: pre-wrap;
}

.ugoku-line {
  padding: 0.125em 0;
}

.ugoku-line-run-error {
  color: var(--ugoku-color-error, #e5534b);
}

.ugoku-run-error-banner {
  display: inline-block;
  margin-right: 0.5em;
  padding: 0 0.5em;
  background: var(--ugoku-color-error, #e5534b);
  color: #fff;
  border-radius: 0.25em;
}

.ugoku-string { color: var(--ugoku-color-string, #22863a); }
.ugoku-number { color: var(--ugoku-color-number, #005cc5); }
.ugoku-boolean { color: var(--ugoku-color-boolean, #d73a49); }
.ugoku-null { color: var(--ugoku-color-boolean, #d73a49); font-style: italic; }
.ugoku-key { color: var(--ugoku-color-key, inherit); }
.ugoku-class-name { color: var(--ugoku-color-class, #6f42c1); }
.ugoku-special { color: var(--ugoku-color-special, #6a737d); font-style: italic; }
.ugoku-punctuation { color: var(--ugoku-color-punctuation, #6a737d); }

.ugoku-composite {
  cursor: pointer;
}

.ugoku-toggle {
  display: inline-block;
  width: 1em;
  color: var(--ugoku-color-punctuation, #6a737d);
}

.ugoku-error-stack {
  margin: 0.25em 0 0 1em;
  color: var(--ugoku-color-special, #6a737d);
  white-space: pre;
}
```

This file has no runtime logic, so it isn't unit tested — its correctness is visual, confirmed by driving the demo page in a browser (see verification step below).

- [ ] **Step 6: Write the barrel export**

`packages/core/src/output-panel/index.ts`:
```ts
export { OutputPanel } from './output-panel';
export { renderValue } from './render-value';
```

- [ ] **Step 7: Run the full suite and typecheck**

Run: `pnpm test`
Expected: all test files PASS, no regressions.

Run: `pnpm typecheck`
Expected: clean, no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/output-panel/output-panel.ts packages/core/src/output-panel/output-panel.browser.test.ts packages/core/src/output-panel/styles.css packages/core/src/output-panel/index.ts
git commit -m "feat: add output panel container with auto-scroll and styles"
```
