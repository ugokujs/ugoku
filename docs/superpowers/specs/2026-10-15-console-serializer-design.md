# Console serializer design

Date: 2026-10-15

## Purpose

Replace the placeholder `SerializedValue` type (a `primitive` / `placeholder`-preview stub) with a real `util.inspect`-style display tree, and spec how that tree renders in the output panel. Covers both the worker-side serialization algorithm and the main-thread rendering, since this is where "feels nice" vs "feels janky" gets decided.

## Architectural constraint

The worker terminates once a run reaches `done` (per the worker protocol spec). Any "expand to see more" interaction in the output panel can therefore only reveal data that was already serialized upfront — it can never trigger new computation in an already-terminated worker. This rules out lazy/on-demand serialization: the full tree (up to the depth/breadth limits below) is always built eagerly, in one pass, before the `console` message is posted.

## The `SerializedValue` tree

```ts
type SerializedValue =
  | { kind: 'primitive'; value: string | number | boolean | null | undefined; truncatedChars?: number }
  | { kind: 'bigint' | 'symbol' | 'function' | 'date' | 'regexp'; preview: string }
  | { kind: 'array'; preview: string; items: SerializedValue[] | null; omittedCount: number }
  | { kind: 'object'; preview: string; className: string | null; entries: Array<{ key: string; value: SerializedValue }> | null; omittedCount: number }
  | { kind: 'map'; preview: string; entries: Array<{ key: SerializedValue; value: SerializedValue }> | null; omittedCount: number }
  | { kind: 'set'; preview: string; items: SerializedValue[] | null; omittedCount: number }
  | { kind: 'error'; name: string; message: string; stack?: string }
  | { kind: 'promise' }
  | { kind: 'circular'; label: string };
```

Composite kinds (`array`, `object`, `map`, `set`) carry both a one-line `preview` (for the collapsed state) and the real `entries`/`items` (for expansion). `entries`/`items` is `null` when the depth limit was reached — there is nothing further to reveal, since the data was never serialized past that point.

`truncatedChars` on `primitive` is present only when a string value was cut off, holding the count of omitted characters. `omittedCount` on composites is `0` unless the breadth limit trimmed trailing items/entries.

This is the only part of the protocol that changes: `ConsoleMessage.args: SerializedValue[]` in `protocol.ts` keeps its field name and position. `ErrorMessage.error: SerializedError` — the flat `{name, message, stack}` shape used for a run-level failure — is untouched; it is a different, already-implemented type, not part of this tree.

## Build algorithm

**Default limits** (matching Node's `util.inspect` conventions, since that's the nearest thing authors are already calibrated to):
- `maxDepth = 2` — composite values nested deeper than this get `entries`/`items: null`.
- `maxItems = 100` — per array/set/map/object, trailing items beyond this are dropped and counted in `omittedCount`.
- `maxStringLength = 10000` — longer strings are cut, with `truncatedChars` recording how many characters were dropped.

**Circular references:** tracked via a path-scoped `Set<object>` — add the object on entry, remove on exit. Only true cycles (an object that is its own ancestor in the current recursion) produce a `{ kind: 'circular', label: '[Circular *1]' }` marker. A non-circular *repeated* reference (the same object appearing twice in unrelated branches) is simply serialized twice — Node's additional behavior of deduping non-circular repeats with `<ref *1>` is a deliberate scope cut, not needed to prevent infinite recursion.

**Property selection:** `object` entries are own enumerable string-keyed properties only, in insertion order — symbol-keyed and inherited properties are excluded. `array`/`set` items preserve iteration order; `map` entries preserve insertion order.

**Preview generation** is a separate, shallower pass from the full recursive build: a composite's `preview` string renders its own keys/items one level deep, but any *nested* composite inside that preview is abbreviated as a type+count placeholder (`Array(2)`, `Map(3)`, a class name, etc.) rather than recursed into. This is what produces `{user: {name: 'Sam', roles: Array(2)}}` instead of a fully expanded nested structure in the collapsed view.

## Special-case scalars

- **Promise:** always `{ kind: 'promise' }`, rendered as `Promise {<pending>}`. No `.then()`/`.catch()` peeking at eventual state — the worker may terminate before it settles, and peeking would require a "patch an already-rendered line" protocol feature and introduce a race (same code sometimes showing resolved, sometimes not). Rejected as unnecessary complexity for this spec.
- **Error:** `{ kind: 'error', name, message, stack }` — same shape as the existing top-level `SerializedError`, rendered through the same stack-trace sub-component the run-failure banner already uses. The banner framing (red background, "run failed" label) stays exclusive to the run-level failure state; a console arg that happens to be an `Error` gets the plain stack-trace rendering inline, with no banner.
- **Function:** `preview` is `[Function: name]`, or `[Function (anonymous)]` when `fn.name` is empty.
- **Symbol:** `preview` is `symbol.toString()` (`"Symbol(description)"`).
- **BigInt:** `preview` is `` `${value}n` ``.
- **Date:** `preview` is `date.toISOString()`.
- **RegExp:** `preview` is `regexp.toString()`.
- **Class instances:** `className` is `value.constructor.name` when it isn't the plain `Object` constructor, and `null` for `Object.create(null)` (which has no constructor at all). A non-null `className` is what prefixes a composite's preview with `Foo {...}` instead of plain `{...}`.

## Output panel rendering

Vanilla DOM, no framework — keeps core tiny, per CLAUDE.md's size constraint. Each `ConsoleMessage` appends a line to the output panel; each arg renders via a recursive `renderValue(value: SerializedValue): HTMLElement`.

- **Collapsed/expanded state is per-node**, not global. A composite value renders as a clickable `<span>` showing its `preview` text with a disclosure triangle (▸/▾). Clicking swaps in an indented child list built from the already-present `entries`/`items`. Child DOM nodes are built lazily on first expand (cheap initial render for chatty runs), but the underlying data was already fully serialized by the worker — expanding never blocks or re-queries anything.
- **Color-coding** via CSS custom properties with built-in fallback values: `--ugoku-color-string`, `--ugoku-color-number`, `--ugoku-color-boolean`, `--ugoku-color-key`, `--ugoku-color-class`, `--ugoku-color-error`, `--ugoku-color-special` (function/date/regexp/symbol/bigint), `--ugoku-color-punctuation`. This lets the panel look reasonable standalone, while a VitePress adapter can override these to point at `--vp-code-*` for theme parity. Final fallback color values are an implementation-time styling decision, not part of this spec.
- **Truncation markers:** `omittedCount > 0` appends a trailing `, … N more` to the expanded list; a truncated string's `truncatedChars` appends `… (N more characters)` after the string.
- `circular` and `promise` kinds render as plain, non-expandable text (`[Circular *1]`, `Promise {<pending>}`).
- **Auto-scroll:** the panel sticks to the bottom as output streams in, unless the reader has manually scrolled up — then auto-scroll pauses until they scroll back to the bottom themselves.

## Out of scope

- Non-circular reference deduplication (Node's `<ref *1>` for repeated-but-not-circular objects) — explicit scope cut.
- Promise state resolution/peeking — explicitly rejected.
- Any change to the run-level `ErrorMessage`/`SerializedError` type.
- Actual CSS color values beyond the custom-property names — implementation-time styling decision.
- TypedArrays, `WeakMap`/`WeakSet`, `ArrayBuffer` — not in the original roadmap requirement list. Fall back to the generic object/class-instance path (rendered via `className`) for now; revisit if it turns out to matter.
