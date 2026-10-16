# Shiki transformer design

Date: 2026-10-16

## Purpose

Build `@ugoku/shiki`: a single Shiki transformer function, `ugokuTransformer()`, that any Shiki-based site registers in its `codeTransformers` array (or equivalent) alongside whatever other transformers it already uses (line highlighting, diff, twoslash, etc.). For each code block, it inspects the fence's raw meta string and, if it finds the `run` or `run edit` flag, stamps `data-ugoku-*` attributes on Shiki's generated `<pre>` element — the contract the already-shipped `@ugoku/core` `mount()`/`unmount()` runtime reads. Blocks without the flag pass through completely untouched: this transformer adds nothing and changes nothing about them, so it's always safe to add to an existing transformer pipeline.

It's build-time only, framework-agnostic (no VitePress-specific code), and has one dependency: `shiki` as a peer dependency, since the consuming site already has its own Shiki version.

**Scope note:** This spec covers only the transformer package. Wiring it into VitePress (`markdown.codeTransformers`, the `docs/` dogfood site, Playwright e2e tests) and the `@ugoku/vitepress` adapter package are separate, follow-up work.

## Mode detection & the twoslash guard

The transformer reads the fence's raw meta string via Shiki's transformer hook (`this.options.meta.__raw` — e.g. for `` ```ts run edit {1,3} ``, that raw string is `"run edit {1,3}"`). Rather than requiring `run` and `edit` to be adjacent or in a fixed order, it tokenizes the string on whitespace and checks for the literal tokens `run` and `edit` independently:

- Neither token present → untouched, no attributes, no-op.
- `run` present, `edit` absent → mode `run`.
- Both `run` and `edit` present → mode `run-edit`, **unless** the same meta string also contains the token `twoslash` (the flag Shiki's official twoslash transformer looks for) — in which case it's silently downgraded to `run`. Per CLAUDE.md: "Twoslash + `run edit`: unsupported. Twoslash + `run` is fine." Downgrading keeps the block usable without requiring the author to know about the restriction.

This tokenizing approach is deliberately permissive about ordering and position so it coexists cleanly with other meta tokens like `{1,3}`, `:line-numbers`, or `[filename.ts]` — it only ever looks for its own three keywords (`run`, `edit`, `twoslash`) and ignores everything else in the string.

## Attributes stamped

For any block resolved to mode `run` or `run-edit`, the transformer's `pre` hook sets these on the generated `<pre>` node:

- `data-ugoku-mode="run"` or `data-ugoku-mode="run-edit"` — the already-fixed contract `mount()` reads (see `docs/superpowers/specs/2026-10-15-mount-run-button-design.md`).
- `data-ugoku-lang="<lang>"` — whatever language Shiki resolved for the block (`this.options.lang`), e.g. `"ts"`, `"js"`. Reserved for v0.3's TypeScript-stripping step (`ts` blocks only) to decide whether a block needs stripping before it runs. Not validated against "is this actually runnable JS" — that's the runtime's concern, not this transformer's.
- Theme name(s), shape depends on the site's Shiki config:
  - Dual-theme site (`this.options.themes`, e.g. `{ light: 'github-light', dark: 'github-dark' }`): `data-ugoku-theme-light="github-light"` and `data-ugoku-theme-dark="github-dark"`.
  - Single-theme site (`this.options.theme`): `data-ugoku-theme="<name>"`.
  - Reserved for v0.2's lazy re-highlighter, which needs to know exactly which theme(s) to load since the runtime only reads the DOM, not build-time config.
- `data-ugoku-hash="<hash>"` — the first 8-10 hex characters of the SHA-256 digest (via Node's built-in `crypto`) of the block's original source text, hashed before Shiki tokenizes it. Reserved for v0.2's localStorage key + staleness detection: hash changes → author edited the snippet → stale reader edits auto-discarded.

**Non-run blocks:** the transformer's hook returns without touching the node at all — not even an empty attribute — so a block with no `run` flag is provably identical whether or not this transformer is in the pipeline.

## Testing approach

Build-time Node code with no DOM — tests run in plain Vitest (Node environment), not the browser-mode setup `@ugoku/core` uses. Tests call Shiki's own `codeToHtml()` (or `codeToHast()`) directly with the transformer registered, feeding it realistic fenced-code strings, and assert on the resulting HTML/hast output. Covers:

- Plain fence (no `run`) → output byte-identical to the same fence with the transformer not registered at all.
- `` ```js run `` → `data-ugoku-mode="run"` plus correct `lang`/`theme`/`hash` attributes.
- `` ```ts run edit `` → `data-ugoku-mode="run-edit"`.
- `run edit` combined with other meta tokens in varying order/position (e.g. `` ```ts {1,3} run :line-numbers edit [file.ts] ``) → still resolves correctly, and a minimal stub transformer simulating another real transformer's own token handling still sees and handles its tokens untouched.
- `run edit` + `twoslash` token present → downgraded to `data-ugoku-mode="run"`.
- Dual-theme config (`themes: { light, dark }`) vs single-theme config (`theme: '...'`) → correct attribute shape for each.
- Hash is deterministic (same source → same hash across calls) and changes when source text changes.

## Out of scope

- VitePress wiring (`markdown.codeTransformers`, the `docs/` dogfood site, Playwright e2e tests) — separate follow-up spec.
- `@ugoku/vitepress` adapter package itself — future, separate.
- Edit-mode overlay, lazy re-highlighting, localStorage persistence (v0.2) — this transformer only stamps the attributes those features will later read; it doesn't consume them itself.
- TypeScript stripping (v0.3) — `data-ugoku-lang` exists for that step to key off of, not implemented here.
- Custom grammar/theme `registerLoader` hook (v0.3).
- Validating that `lang` is JS-runnable — the transformer stamps whatever `lang` Shiki resolved regardless of whether the runtime can currently execute it.
- Detecting or handling other transformers' decorations (line highlight, diff, focus) beyond simply not interfering with them — the "decorations dropped on first edit" tradeoff is a v0.2 runtime concern, not this build-time transformer's.
