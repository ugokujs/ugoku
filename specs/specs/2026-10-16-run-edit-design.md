# `run edit` Design (v0.2)

## Summary

v0 shipped `run` blocks: a Run button, a worker runner with timeout/Stop, and a streamed console output panel. The transformer and `mount()` already recognize `run edit` blocks via `data-ugoku-mode="run-edit"`, but nothing makes them editable yet — Run just executes the original build-time source, same as a plain `run` block.

This spec adds the actual editing behavior: a transparent textarea overlay over the highlighted `<pre>`, lazy Shiki re-highlighting loaded only when a reader actually interacts with a block, localStorage persistence keyed by the block's source hash, and a Reset button. It also adds a self-hostable build of the editing code for sites with no bundler.

## Architecture & Data Flow

`mount.ts`'s `mountOne()` is extended: for `mode === 'run-edit'` blocks only, it does additional setup beyond the existing Run/Stop/output-panel wiring (`run` blocks are completely untouched by this feature).

1. **Overlay creation.** Create a `<textarea class="ugoku-edit-overlay">`, absolutely positioned over the `<pre>`, matching its font, line-height, and padding. Background and text color are transparent; only the caret and text selection are visible. The underlying `<pre>` remains visible through it and is what actually renders syntax-highlighted color — the textarea exists purely to capture keyboard input and show the cursor.

2. **Restore check.** At mount, synchronously check `localStorage` for a saved edit keyed by the block's `data-ugoku-hash`.
   - **Saved edit found:** populate the textarea with the saved text and immediately `await import('@ugoku/core/edit')` to re-highlight it to match, before the reader does anything. This is a deliberate, narrow exception to "never load Shiki on initial page load" — it only fires for blocks a specific reader has personally edited before, not for the default first-time view.
   - **No saved edit:** the textarea starts empty-on-top-of-original (the reader sees the build-time-highlighted `<pre>` through it, since the overlay's own text is empty and transparent). The edit chunk is not imported.

3. **Lazy load on focus.** If the edit chunk hasn't already been loaded (via step 2), the first `focus` event on the textarea triggers `await import('@ugoku/core/edit')`. This only *warms* the chunk — it does not, by itself, change anything visually or drop any decorations from other transformers. Those only happen on the first actual `input` event, matching the already-decided tradeoff ("on first edit they're dropped, tokens re-rendered").

4. **Re-highlight on input.** On every `input` event, debounced ~400ms after the reader stops typing:
   - Save the current textarea value to `localStorage` under the block's hash key.
   - Re-highlight the current text using a shared, per-page `shiki/core` highlighter instance (see Shared Highlighter below), splice the resulting tokens into the `<pre><code>`'s innerHTML (preserving the `<pre>`'s own attributes/classes).

5. **Reset.** A new `.ugoku-reset-btn` is always present in `.ugoku-controls` for `run-edit` blocks (not conditionally shown). Clicking it:
   - Removes the `localStorage` entry for this block's hash.
   - Restores the `<pre>`'s original build-time markup, cached once (before the very first re-highlight ever happens for this block) specifically so Reset keeps working no matter how many times the block has been re-highlighted since.
   - Clears the textarea.
   - A no-op if nothing was ever saved.

6. **Run uses live content.** The existing Run button reads the textarea's *current* value (edited or original) rather than the original hash-source — this is the one change to existing Run wiring this feature requires.

### Shared highlighter

Multiple `run edit` blocks on one page must not each independently load the same grammar/theme. `@ugoku/core/edit` maintains one `shiki/core` `HighlighterCore` instance per page (module-level singleton, lazily created on first use), loading each distinct `(lang, theme)` combination only once and reusing it across all blocks that share it.

## Packaging

### Bundler path (primary)

`@ugoku/core`'s `package.json` gains a new `exports` subpath:

```json
{
  "exports": {
    ".": "./src/index.ts",
    "./edit": "./src/edit/editor.ts"
  }
}
```

`packages/core/src/edit/` contains:
- `editor.ts` — overlay creation, restore/focus/input wiring, Reset, Run-value override. Exports a single entry point `mount.ts` calls via dynamic import.
- `highlighter-cache.ts` — the shared per-page `HighlighterCore` singleton and per-`(lang, theme)` load deduplication.

Any site with a bundler (VitePress included) gets automatic code-splitting for free from the `await import('@ugoku/core/edit')` call sites in `mount.ts` — no new build step, no CDN involved, consistent with the project's local-first, no-server constraint.

### No-bundler path (self-hostable chunk)

For sites with no bundler, a new build script `packages/core/scripts/build-edit-chunk.ts` uses esbuild to produce one self-contained ESM file: `packages/core/dist/edit-standalone.js`. This bundles `shiki/core`, the JS regex engine, and a **fixed preset** of grammars and themes baked in at build time:

- Languages: `javascript`, `typescript` (the only languages ugoku v0/v0.2 actually executes).
- Themes: `github-light`, `github-dark` (VitePress's own defaults — a no-bundler site is likely to already be using these).

If a block's `data-ugoku-lang` or `data-ugoku-theme*` isn't in this preset, the block still gets a working plain-text-editable textarea and Run still works — it just doesn't get re-highlighted. This is a known, documented limitation, not a silent failure.

Invoked via `pnpm --filter @ugoku/core build:edit-chunk`. The output is a new build artifact (not committed to git, same pattern as `docs/.vitepress/dist`), checked in CI for two things: it stays under the project's size budget, and it has no bare external imports beyond what's bundled in (i.e. it's genuinely self-contained and copy-pasteable to any static host).

## Error Handling

- **Dynamic import failure** (offline, blocked asset, restrictive CSP) on either path: caught, a soft warning is logged to the block's own output panel (not thrown), the textarea remains plain-text editable, and Run is unaffected.
- **`localStorage` unavailable or throws** (private browsing, quota exceeded, disabled entirely): wrapped in try/catch; the feature degrades to in-memory-only editing for that page view — no error surfaced to the reader, no persistence across reloads.
- **Stale edits after an author changes a snippet:** the source hash changes, so old `localStorage` entries are simply never read again. No active cleanup pass is needed — this was already the designed behavior from the original architecture notes.

## Testing

- **Unit/browser tests** (`packages/core/src/edit/*.browser.test.ts`, same Vitest browser-mode pattern already used across `@ugoku/core`):
  - Overlay is correctly sized/positioned over the `<pre>`.
  - First `focus` triggers exactly one dynamic import of the edit chunk; a second `focus` does not re-import.
  - `input` is debounced: rapid keystrokes produce one save + one re-highlight, not one per keystroke.
  - Reset restores the original cached markup and clears the `localStorage` entry, regardless of how many edits preceded it.
  - Run reads the textarea's current value, not the original source.
  - A `localStorage` that throws on `setItem`/`getItem` doesn't crash the block.
  - Saved-edit restore on mount re-highlights before any interaction (eager-restore path).

- **e2e** (`e2e/dogfood.spec.ts`): a new docs page with a `run edit` block gets a new test — type into the overlay, reload the page, assert the edit persisted and is shown re-highlighted; click Reset, assert it reverts to the original.

- **No-bundler smoke test**: a bare HTML fixture with no bundler/import-map, referencing only `dist/edit-standalone.js` via a plain `<script type="module">`, confirms it re-highlights a JS block standalone.

## Known Limitations (carried from CLAUDE.md, reaffirmed here)

- Decorations from other transformers (line highlight, diff, focus, line numbers) are dropped on first edit and cannot be re-applied client-side.
- Twoslash + `run edit` remains unsupported (Twoslash + `run` is unaffected).
- The no-bundler chunk's grammar/theme coverage is a fixed preset (JS/TS, github-light/dark), not arbitrary — a deliberate scope boundary for this release, not a bug.
