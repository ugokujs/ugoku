# ugoku

Lightweight, local-first runnable code snippets for sites that use Shiki.
Authors add `run` to a code fence; readers get a Run button and console output.
Open source.

## Decided

- **Audience:** anyone using Shiki — docs/API authors, technical writers, educators.
- **Execution:** fully in-browser. No server, ever. Works offline after first load.
- **Output:** console only (logic, algorithms). No DOM/iframe mode.
- **Runner:** module Web Worker from a Blob URL. Gives top-level await, real timeouts, and a Stop button via `worker.terminate()`.
- **Fence syntax:** `run` = run-only. `run edit` = editable. Author decides per block.
- **Editing:** when enabled, transparent textarea overlay over the highlighted `<pre>`, with lazy Shiki re-highlighting (`shiki/core` + JS regex engine + only the block's grammar and theme(s)), loaded on first focus. Never on initial page load.
- **Dogfood target:** VitePress first.
- **Name:** ugoku (動く, "to move / to work").

## Architecture

- **Build time:** a Shiki transformer reads fence meta, and for `run` blocks stamps data attributes on the `<pre>`: mode (run / run edit), lang, theme(s) (light/dark pair for dual themes), source hash. Non-run blocks are untouched.
- **Runtime:** reads the DOM only. Executes the code's `textContent`.
  - Explicit `mount(root)` / `unmount(root)` API. Do NOT only scan on DOMContentLoaded.
  - Must not touch `window`/`document` at import time (VitePress SSRs at build).
  - Console capture: proxy `console.*` in the worker, post messages back.
  - Output streams as it arrives; worker stays alive until idle or timeout.
- **Persistence (edit mode):** localStorage keyed by the original source hash, plus a Reset button. Author changes the snippet → hash changes → stale reader edits are discarded automatically.
- **Size:** keep core tiny. Treat a size budget as a hard constraint and measure it in CI.

## Packages (pnpm monorepo)

- `@ugoku/core` — runtime, worker runner, output panel, serializer
- `@ugoku/shiki` — the transformer
- `@ugoku/vitepress` — thin adapter: transformer + theme route-change hook
- `@ugoku/astro` — plain Astro adapter: single integration auto-wiring the Shiki transformer + per-page mount/navigation script. Not Starlight — see `@ugoku/expressive-code`.
- `@ugoku/expressive-code` — later; needed to reach Astro Starlight users (Starlight replaces Shiki with its own highlighter, so this is separate, harder work from the plain Astro adapter)
- `ugoku` — unscoped; reserved / re-export of core (undecided)
- `docs/` — VitePress site. The docs are the dogfood; every runnable example is also a test case.

## VitePress notes

- Transformers go in `markdown.codeTransformers` in the VitePress config.
- VitePress already uses the fence info string (`{1,3}`, `:line-numbers`, `[filename]`). `run` / `run edit` must parse alongside these. Test the combinations early.
- Each `<pre>` is wrapped in `div.language-*` with VitePress's copy button and label. Mount the Run button and output panel at that level.
- Match VitePress styling via its `--vp-code-*` CSS variables.
- It's an SPA: call `mount` on route change from the theme, not just on first load.

## Known tradeoffs

- **Other transformers:** decorations from other transformers (line highlight, diff, focus, line numbers) can't be re-applied client-side. On first edit they're dropped and tokens re-rendered. Document this.
- **Twoslash + `run edit`:** unsupported. Twoslash + `run` is fine.
- **Local-first vs lazy loading:** the edit chunk must not come from a CDN. Ship it as a separate entry the site's bundler code-splits, plus a prebuilt self-hostable chunk for no-bundler setups.
- **Custom grammars/themes** not in Shiki's bundle need a `registerLoader` hook (v0.3).
- **Bare imports** (`import x from 'lodash'`): proposed approach is author-controlled import maps; no default CDN.

## Roadmap

- **v0 (done):** transformer with `run`; worker runner with timeout + Stop; streamed console panel with a good serializer; JS only; VitePress adapter; Playwright tests against the docs site.
- **v0.2 (done):** `run edit` — overlay editor, lazy re-highlight, localStorage persistence + Reset.
- **v0.3:** TypeScript via lazy-loaded type stripping (Sucrase, `ts` blocks only; no type-checking) — **done**. Custom grammar/theme loader hook (`registerLoader`) — pending.
- **v0.4 (done):** plain Astro adapter (`@ugoku/astro`) — single auto-wiring integration (unlike `@ugoku/vitepress`'s two manual steps), handling both Astro navigation models (plain MPA and `<ClientRouter />` transitions) from one `client.ts`.
- **Later:** Expressive Code adapter (Astro Starlight support — separate/harder than plain Astro, since Starlight doesn't use Shiki transformers); language plugins (e.g. Pyodide) as lazy-loaded opt-ins, never in core. Plugin shape: `run(code) → stream of output events`. A generic rehype/unified plugin (build-time half only, framework-agnostic) to reach Next.js MDX, Nextra, Eleventy, and other unified.js pipelines in one package instead of one-off adapters — each framework would still need its own thin client-side mount/navigation script, same as `@ugoku/astro`'s.

## Housekeeping

- npm org `@ugoku` — claimed.
- GitHub org `ugokujs`, repo `ugokujs/ugoku` — created.
- Remaining: README, LICENSE, CI, flip packages from `private: true` / `0.0.0` to real publish config.

## Contributing

There is no required process or tooling for contributing — use whatever workflow you like. Note: `specs/` and `.superpowers/` are gitignored on purpose (local planning/scratch, not project content) — if your own tooling writes design docs or plans into a `specs/` folder, those won't be tracked here either.
