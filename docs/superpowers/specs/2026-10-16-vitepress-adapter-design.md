# VitePress adapter design

Date: 2026-10-16

## Purpose & scope

Build `@ugoku/vitepress`: a tiny client-side adapter exposing one function that wires `@ugoku/core`'s `mount()`/`unmount()` into VitePress's SPA navigation lifecycle. That's the entire package — the Shiki transformer half needs **no adapter at all**: a site registers `ugokuTransformer()` directly in its own `.vitepress/config.ts` via `markdown.codeTransformers`, since VitePress's `createMarkdownRenderer` accepts transformers generically and the transformer works unmodified against VitePress's bundled Shiki engine (verified directly — see "Compatibility finding" below).

So `@ugoku/vitepress`'s only job: on first load, mount every runnable code block already on the page; on every subsequent SPA navigation, unmount the outgoing page's blocks (stopping any in-flight run first) then mount the incoming page's blocks.

**Out of scope:** scaffolding the real `docs/` dogfood site content and Playwright e2e tests — separate, immediate follow-up work.

## Compatibility finding

VitePress 1.6.4 bundles **Shiki v2.5.0** internally, not the v4 that `@ugoku/shiki`'s `package.json` currently declares as a peer dependency. This was verified directly, not assumed: `ugokuTransformer()` was run through VitePress's real `createMarkdownRenderer()` (its actual markdown-it + Shiki v2 pipeline, not a mock or stub), rendering `` ```js run edit {1,3} `` and confirming the output carried `data-ugoku-mode="run-edit"` plus correct hash/dual-theme attributes, coexisting cleanly with VitePress's own line-highlight decorator and `div.language-*` / copy-button wrapper.

The Shiki transformer hook API (`ShikiTransformer`, `meta.__raw`, `this.source`, `this.options.theme`/`themes`) is stable across Shiki v2 through v4 (same `@shikijs/types` shape), so there is no runtime incompatibility. But the peer dependency as currently written is misleading: a VitePress site never installs `shiki` itself, so `@ugoku/shiki`'s `peerDependencies: { "shiki": "^4.0.0" }` would sit permanently unsatisfied for every VitePress consumer.

**Fix (folded into this plan):** change `packages/shiki/package.json` to add `peerDependenciesMeta: { "shiki": { "optional": true } }`. The peer dep itself stays — it documents the type contract for anyone who installs `shiki` directly (e.g. to call `codeToHtml` themselves outside VitePress) — but `optional: true` stops package managers from warning when it's absent, which is the normal case for a VitePress site.

## The route-change hook

VitePress's theme `enhanceApp({ router })` gets a `Router` object with two relevant mutable hook slots (confirmed from VitePress 1.6.4's shipped client types):

```ts
interface Router {
  onBeforeRouteChange?: (to: string) => Awaitable<void | boolean>; // false cancels navigation
  onAfterRouteChange?: (to: string) => Awaitable<void>;
}
```

These are plain settable properties, not an event-listener list — assigning one clobbers whatever was there before. Since a real site's own `enhanceApp` often wants these too (analytics, etc.), `@ugoku/vitepress` **chains** rather than clobbers: it captures whatever hook was already on the router, installs its own, and calls through to the original afterward — preserving `onBeforeRouteChange`'s cancellation semantics (if the original hook returns `false`, navigation still cancels).

Timing matters: `unmount()` must run in `onBeforeRouteChange`, not `onAfterRouteChange`. VitePress swaps the Vue component tree on navigation, so by the time `onAfterRouteChange` fires, the outgoing page's `<pre>` elements are already detached — `unmount`'s `pre[data-ugoku-mounted]` query would find nothing, and any in-flight Worker from that page would leak (a `Worker` keeps running until `.terminate()` is called; it doesn't stop just because its DOM anchor is gone). So: `onBeforeRouteChange` → `unmount(document.body)`, `onAfterRouteChange` → `mount(document.body)`.

VitePress also calls `enhanceApp` during its build-time SSR pass (no `document` exists then). Rather than depending on VitePress's own `inBrowser` export for this guard, the adapter does its own `typeof document !== 'undefined'` check, so `@ugoku/vitepress` has **zero runtime dependency on `vitepress` or `shiki`** — not even a peer dependency. It only depends on `@ugoku/core`, and accepts a minimal, structurally-typed `router` parameter (just the two hook properties) rather than importing VitePress's real `Router` type.

There's no "route change" event for the very first page (it's already there from SSR/hydration), so the setup function also calls `mount(document.body)` once immediately, guarded by the same browser check.

## Public API & usage

One exported function:

```ts
export function setupVitePressMount(router: {
  onBeforeRouteChange?: (to: string) => void | boolean | Promise<void | boolean>;
  onAfterRouteChange?: (to: string) => void | Promise<void>;
}): void
```

A consuming site wires it in two places, with no other code needed:

```ts
// .vitepress/config.ts
import { ugokuTransformer } from '@ugoku/shiki';

export default {
  markdown: { codeTransformers: [ugokuTransformer()] },
};
```

```ts
// .vitepress/theme/index.ts
import DefaultTheme from 'vitepress/theme';
import { setupVitePressMount } from '@ugoku/vitepress';

export default {
  extends: DefaultTheme,
  enhanceApp({ router }) {
    setupVitePressMount(router);
  },
};
```

## Testing approach

This package has no DOM manipulation of its own (that's `@ugoku/core`'s job) — it's pure wiring logic, so it runs under the same Node-environment Vitest project as `@ugoku/shiki` (add `packages/vitepress/**/*.test.ts` to that project's existing `include` glob; no new Vitest project needed). Tests construct a plain object literal matching the minimal router shape (no real VitePress needed) and spy on `@ugoku/core`'s `mount`/`unmount` (the package's only dependency) to verify:

- Calling `setupVitePressMount(router)` immediately calls `mount(document.body)` once.
- Triggering the router's `onBeforeRouteChange` calls `unmount(document.body)`.
- Triggering `onAfterRouteChange` calls `mount(document.body)`.
- If the router already had an `onBeforeRouteChange` that returns `false`, the wrapped hook still returns `false` (navigation-cancel semantics preserved) and `unmount` still ran first.
- If the router already had hooks (both before/after), both original hooks still get called (chaining, not clobbering).
- Guarded no-op when `document` is undefined — this is free to verify in this package's plain Node test environment, which has no `document` global by default, proving the guard without needing jsdom.

A manual smoke test against a real local VitePress 1.6.4 install (scaffolded via `npx create-vitepress`, not committed) verifies the whole loop end-to-end: transformer registered in config, adapter wired into theme, click Run on a real page, navigate to a second page, confirm the first page's Worker is gone and the new page's blocks are mounted.

## Out of scope

- Scaffolding the real `docs/` dogfood site content and Playwright e2e tests — separate, immediate follow-up.
- Visual styling matched against VitePress's `--vp-code-*` variables — deferred, same as the mount-run-button feature.
- `run edit`'s actual editor overlay — v0.2, unrelated to this adapter.
- Any changes to `@ugoku/core` or `@ugoku/shiki` beyond the one `peerDependenciesMeta` fix described above.
