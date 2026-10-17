# TypeScript Execution Design (v0.3, part 1)

## Summary

`ts`-lang `run`/`run edit` blocks are already highlighted and editable today — `@ugoku/core/edit`'s highlighter paths already support `typescript` as a grammar. The gap is narrower than "TypeScript support" sounds: clicking Run on a `ts` block sends the raw TypeScript source straight into the worker's `import()` of a Blob URL, which throws a `SyntaxError` on any type annotation, since nothing strips types first.

This spec closes that gap: types are stripped via Sucrase immediately before execution, in a lazy-loaded chunk following the same packaging pattern `@ugoku/core/edit` established in v0.2 (bundler subpath + prebuilt no-bundler standalone file). `tsx` is explicitly out of scope — JSX needs a DOM/render target that doesn't exist in this console-only project, and would produce `React.createElement()` calls with nowhere to go.

While touching the code that detects a block's language, this spec also fixes a related gap discovered during design: Shiki's transformer hook receives the fence's lang exactly as the author typed it (`ts` or `typescript`, both valid), but the no-bundler edit-highlight chunk's `SUPPORTED_LANGS` check only matches the literal string `'typescript'` — so a `ts run edit` block today silently loses live re-highlighting on every edit, no error shown. Both this gap and the new TS-execution gate share one root cause (lang-alias handling) and one fix.

## Architecture & Data Flow

### Where stripping happens

Stripping happens on the **main thread**, synchronously before `runCode()` is called. The worker is unchanged — it still only ever receives plain JS via `postMessage`, exactly as today.

`mount.ts`'s `runBtn` click handler becomes async:

1. Read the current source via the existing `getCurrentSource()` (unchanged — for `run edit` blocks this already returns the live textarea value).
2. If `normalizeLang(pre.dataset.ugokuLang)` is `'typescript'`: `await` the lazy TS chunk, call `stripTypes(code)`.
   - **Strip succeeds:** pass the stripped JS to `runCode()`, same as today.
   - **Strip throws** (a genuine syntax error unrelated to types — e.g. unbalanced braces): render it through the existing `onError`/`appendError` output-panel path, the same visual treatment as a runtime error. The worker is never created; `Run` re-enables immediately, `Stop` never enables.
3. If the block is Stopped while the strip is still in flight (before the worker exists), the subsequent `runCode()` call is skipped — `stop()` just needs to set a flag the async handler checks after `await`ing the chunk/strip.
4. For any other lang, behavior is unchanged — source goes straight to `runCode()`.

### Chunk packaging

Mirrors `@ugoku/core/edit` exactly:

- `packages/core/src/ts/strip.ts` — exports `stripTypes(code: string): string`, wraps Sucrase's `transform(code, { transforms: ['typescript'] }).code`. Lazy-loaded via `import('../ts/strip.ts')` from `mount.ts`, cached as a module-level singleton promise (same pattern as `editChunkPromise`/`highlighterPromise`), loaded on **first Run click** of any `ts`-lang block — not on page load, not on focus. Stripping is only useful at the moment of execution, so there's no reason to warm it earlier the way the edit chunk warms on focus.
- New `@ugoku/core` package.json export subpath: `"./ts": "./src/ts/strip.ts"`.
- `packages/core/src/ts/standalone-entry.ts` + `packages/core/scripts/build-ts-chunk.mjs` (esbuild, same shape as `build-edit-chunk.mjs`) → prebuilt `packages/core/dist/ts-standalone.js`, for no-bundler sites. This bundles Sucrase directly — no CDN, no bare import, consistent with the project's local-first, no-server constraint and the same reasoning that produced `edit-standalone.js`.
- `scripts/verify-standalone-chunk.mjs` is extended to also check `ts-standalone.js` (self-contained, no bare external imports, under the project's size budget).

A `ts run edit` block needs **both** chunks (strip, to run; highlight, to show live syntax color on edit) — they stay two separate lazy chunks rather than merging, since a `run`-only `ts` block needs stripping but not highlighting, and a `run edit` JS block needs highlighting but never needs Sucrase at all. Loading one never pulls in the other.

### Lang detection / alias fix

New tiny shared helper (e.g. `packages/core/src/lang.ts`, or colocated wherever is least awkward — implementer's call): `normalizeLang(lang: string | undefined): string | undefined`, mapping `'ts' → 'typescript'` and `'js' → 'javascript'` (identity otherwise). Used in two places:

1. `mount.ts`'s Run-click handler, to decide whether a block needs the TS strip chunk.
2. `packages/core/src/edit/standalone-entry.ts`'s `SUPPORTED_LANGS` check, replacing the current literal-string comparison — fixes the existing silent-no-re-highlight gap for `ts`/`js`-shorthand fences in `run edit` blocks on no-bundler sites.

No change needed to `packages/core/src/edit/editor.ts` (the bundler-aware highlight path) or `highlighter-cache.ts`'s `ensureLoaded` — both already pass the lang straight through to Shiki's own `bundledLanguages` lookup, which already recognizes both aliases as object keys.

## Error Handling

- **Strip failure** (genuine syntax error): shown via the existing output-panel error rendering, no new UI. Worker never starts.
- **Lazy chunk load failure** (offline, blocked asset, restrictive CSP): caught, surfaced as a warning in the output panel (same pattern `mount.ts` already uses for a failed edit-chunk load), Run re-enables, no worker started. The block is not retried automatically — a later Run click tries the import again.
- **Stop during an in-flight strip**: no error, just a silent no-op — the pending `runCode()` call is skipped, Run/Stop return to idle immediately rather than waiting for the chunk to finish loading.

## Testing

- **Unit tests** (`packages/core/src/ts/strip.test.ts`): interfaces, type annotations, generics, `as` casts, enums all strip cleanly to valid, equivalent-behavior JS; a genuine (non-type-related) syntax error still throws.
- **Unit test** for `normalizeLang()`: both alias directions, identity passthrough for unrecognized langs.
- **Browser test** extending `mount.browser.test.ts`: Run on a `ts`-lang block strips then executes successfully; a block whose source has a real syntax error shows the error without ever starting a worker; clicking Stop while the strip chunk is still loading results in no run.
- **Browser test** extending `splice.browser.test.ts` or a new `standalone-entry` test: confirms `ts`/`js`-shorthand fences are now recognized by the no-bundler `SUPPORTED_LANGS` check.
- `scripts/verify-standalone-chunk.mjs` extended to cover `ts-standalone.js`.
- **Docs/e2e dogfood**: a new `ts run` example and one `ts run edit` example added to the docs site (`docs/index.md` or a new page), each covered by a new `e2e/dogfood.spec.ts` test that clicks Run and asserts the expected console output — consistent with "every runnable example is also a test case."

## Known Limitations

- `tsx` is not supported — fences with `tsx` lang get highlighting (Shiki already supports it) but no stripping; Run on a `tsx` block behaves as it does today (raw source sent to the worker, throws on JSX/type syntax). Not treated as a regression since nothing currently claims `tsx` works.
- No type-checking of any kind — a block with a type error but otherwise valid JS at runtime (e.g. `const x: string = 5`) strips and runs fine, silently ignoring the type error. This is the explicit, intentional tradeoff named in CLAUDE.md's roadmap ("no type-checking").
- Sucrase's `typescript` transform does not include decorator support by default; decorator-using snippets are out of scope for this spec (not currently a documented use case for ugoku's audience) and can be added later as an additional Sucrase transform flag if requested.
