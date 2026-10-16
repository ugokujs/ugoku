# Mount / Run button wiring design

Date: 2026-10-15

## Purpose

Build the `@ugoku/core` layer that connects the already-shipped worker runner (`runCode`) and output panel (`OutputPanel`/`renderValue`) to real `<pre>` elements in a page: an explicit `mount(root)` / `unmount(root)` API that scans for runnable code blocks, injects a Run/Stop control row and an output panel, and wires clicks through to the runner. This is the last `@ugoku/core` piece needed before the Shiki transformer and VitePress adapter can make it dogfoodable end-to-end.

## Data-attribute contract

The Shiki transformer doesn't exist yet — this spec fixes the contract it must produce. `mount()` scans for:

```html
<pre data-ugoku-mode="run">...</pre>
<pre data-ugoku-mode="run-edit">...</pre>
```

`data-ugoku-mode` is the only attribute this task reads. The architecture note in CLAUDE.md also calls for the transformer to stamp `lang`, a light/dark theme pair, and a source hash — those exist for later work (TypeScript stripping in v0.3, edit-mode persistence in v0.2) and are out of scope here; `mount()` ignores them.

Both `"run"` and `"run-edit"` get identical treatment in this task: a Run button, a Stop button, and an output panel. No editor overlay and no persistence yet — that's v0.2. This means the two modes are visually indistinguishable for now, which is expected and temporary; treating `run-edit` pre's as plain `run` keeps them usable immediately rather than dead until v0.2 lands.

## Injected DOM structure

For each matched, not-yet-mounted `<pre>`, `mount()` reads the `<pre>`'s `textContent` as the run source (per the existing architecture: the runtime reads the DOM only) and inserts, immediately after the `<pre>`:

```html
<div class="ugoku-controls">
  <button class="ugoku-run-btn">Run</button>
  <button class="ugoku-stop-btn" disabled>Stop</button>
</div>
```

...followed by an `OutputPanel`'s `element` (one instance per `<pre>`), created hidden (`display:none`) until the first callback fires for that run — not immediately on click — so a snippet that's all `setTimeout` doesn't flash an empty box before it has anything to show.

## Wiring

- **Run click** → `panel.clear()` → `runCode(source, callbacks)`. Run becomes `disabled`, Stop becomes enabled for the duration of the run.
- **Stop click** → the current `RunHandle.stop()`.
- `onConsole(level, args)` → `panel.appendConsole({ level, args })`; panel becomes visible if hidden.
- `onError(error)` → `panel.appendError(error)`; panel becomes visible if hidden.
- `onDone` / `onError` / `onTimeout` / `onStopped` all re-enable Run and disable Stop — a run is no longer in flight either way.

A second Run click on the same `<pre>` calls `panel.clear()` first, so each run replaces the previous one's output rather than appending to it.

## OutputPanel.clear()

One new public method on the already-shipped `OutputPanel` class:

```ts
clear(): void {
  this.element.replaceChildren();
}
```

This is the only change to previously-shipped code in this task — a small, targeted addition, not a refactor.

## Idempotency and cleanup tracking

- On first mount, a `<pre>` gets `data-ugoku-mounted="true"`. The scan query is `pre[data-ugoku-mode]:not([data-ugoku-mounted])`, so calling `mount()` again on overlapping DOM (e.g. a VitePress soft navigation that re-runs mount on the whole page) only picks up genuinely new blocks.
- The injected controls div and output panel are the mounted `<pre>`'s next two siblings — reachable via `nextElementSibling` chaining, so no separate registry is needed to find them for teardown.
- The currently-active `RunHandle` (if a run is in flight) for a given `<pre>` is stashed in a module-scoped `WeakMap<HTMLPreElement, RunHandle>`. A `WeakMap` is used specifically so that if a `<pre>` is removed from the DOM without `unmount()` ever being called, the entry can still be garbage-collected rather than pinning it in memory forever.
- `unmount(root)` finds every `pre[data-ugoku-mounted]` under `root`, looks up and stops (`RunHandle.stop()`) any active run for it, removes the controls div and output panel, and clears the `data-ugoku-mounted` flag.

Stopping in-flight runs on `unmount()` matters specifically for VitePress's SPA navigation: leaving a worker running after the reader navigates away from the page would leak it.

## Testing approach

New file `packages/core/src/mount/mount.browser.test.ts` (real-DOM browser-mode, same Chromium setup as the rest of the project), plus one new test in the existing `packages/core/src/output-panel/output-panel.browser.test.ts` for `clear()`. Covers:

- `mount()` injects a controls div + hidden output panel for both `data-ugoku-mode="run"` and `"run-edit"` pre's; does nothing to `<pre>` elements without the attribute.
- Calling `mount()` twice on overlapping DOM doesn't double-inject (idempotency via `data-ugoku-mounted`).
- Clicking Run actually runs the `<pre>`'s `textContent` through the real worker pipeline (a genuine `console.log` round-trip, not mocked) and renders it into the panel; the panel becomes visible; Stop becomes enabled, Run disabled.
- Clicking Run a second time clears the prior output before the new run's output appears.
- Clicking Stop while a run is in flight calls through to `RunHandle.stop()` and re-enables Run.
- `unmount()` removes the injected controls/panel and stops any in-flight run for pre's under the given root; a `<pre>` left in flight when `unmount()` runs doesn't keep producing console messages afterward (no orphaned worker).

## Out of scope

- The Shiki transformer itself (a separate, future task) — this spec only fixes the attribute contract it must produce.
- Edit-mode overlay, lazy re-highlighting, localStorage persistence — v0.2.
- VitePress-specific wrapper/route-change integration (`@ugoku/vitepress`) — a separate, future adapter package; this task's `mount`/`unmount` are framework-agnostic and operate on any `ParentNode`.
- Visual styling of the controls row and Run/Stop buttons beyond functional markup — left to CSS, matched against VitePress's `--vp-code-*` variables later, same as the output panel.
