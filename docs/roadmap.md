# Roadmap

## Done

- **v0** — `run` blocks: build-time Shiki transformer, Web Worker runner with timeout + Stop, streamed console output with a proper serializer, JavaScript only, VitePress adapter.
- **v0.2** — `run edit`: editable overlay, lazy re-highlighting, `localStorage` persistence with Reset.
- **v0.3 (TypeScript)** — type annotations stripped in-browser via [Sucrase](https://github.com/alangpierce/sucrase) before execution. No type-checking — this only removes syntax that isn't valid JS.
- **v0.4 (plain Astro)** — a single `@ugoku/astro` integration: add it to `integrations` in `astro.config.mjs` and both the Shiki transformer and the client mount/navigation script are wired automatically. Works under Astro's default full-page navigation and under its opt-in `<ClientRouter />` view transitions.

## In progress / next up

- **v0.3 (loader hook)** — a `registerLoader` hook for custom grammars/themes not in Shiki's bundle.

## Later

- **Astro Starlight support** (`@ugoku/expressive-code`) — Starlight replaces Shiki with its own highlighter (Expressive Code), so this needs real adapter work rather than just wiring config, unlike the plain Astro adapter above.
- **Language plugins** (e.g. Pyodide) as lazy-loaded opt-ins — never bundled into core. Plugin shape: `run(code) → stream of output events`.

## Known limitations

- Decorations from other Shiki transformers (line highlight, diff, focus, line numbers) can't be re-applied client-side — on first edit they're dropped and tokens re-rendered.
- [Twoslash](https://twoslash.netlify.app/) is supported with `run`, not with `run edit`.
- Output is console-only — no DOM/iframe rendering, so this fits logic/algorithm examples, not UI demos.
