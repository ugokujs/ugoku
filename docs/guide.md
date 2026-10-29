# Guide

## Installation

### Astro

Install the package:

::: code-group

```bash [npm]
npm install @ugoku/astro
```

```bash [pnpm]
pnpm add @ugoku/astro
```

```bash [yarn]
yarn add @ugoku/astro
```

:::

Add the integration — it wires up both the Shiki transformer and the page script in one step:

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { ugoku } from '@ugoku/astro';

export default defineConfig({
  integrations: [ugoku()],
});
```

### VitePress

Install the package:

::: code-group

```bash [npm]
npm install @ugoku/vitepress
```

```bash [pnpm]
pnpm add @ugoku/vitepress
```

```bash [yarn]
yarn add @ugoku/vitepress
```

:::

Register the transformer in your VitePress config:

```ts
// .vitepress/config.ts
import { defineConfig } from 'vitepress';
import { ugokuTransformer } from '@ugoku/vitepress';

export default defineConfig({
  markdown: {
    codeTransformers: [ugokuTransformer()],
  },
});
```

Hook the mount into your theme, so ugoku re-scans on VitePress's SPA route changes, not just on first load:

```ts
// .vitepress/theme/index.ts
import DefaultTheme from 'vitepress/theme';
import { setupVitePressMount } from '@ugoku/vitepress/client';

export default {
  extends: DefaultTheme,
  enhanceApp({ router }) {
    setupVitePressMount(router);
  },
};
```

## Writing runnable snippets

Add `run` to a fence's info string for a run-only block, or `run edit` to also let readers modify the code before running it:

````md
```js run
console.log('hello');
```

```ts run edit
function add(a: number, b: number): number {
  return a + b;
}
console.log(add(2, 3));
```
````

`run edit` blocks persist reader edits to `localStorage`, keyed by the block's original source. If the author changes the snippet, the key changes too and any stale edit is discarded automatically.

TypeScript blocks (`ts`) have their type annotations stripped in the browser via [Sucrase](https://github.com/alangpierce/sucrase) before execution — this isn't type-checking, just enough to make the code valid JavaScript.

## Styling

ugoku ships markup with stable class names and CSS variables, but leaves the actual look to you — there's no default visual design to fight.

### Buttons

The run controls have no default styles at all. Target these classes directly in your own CSS:

| Class | Element |
| --- | --- |
| `.ugoku-controls` | Wrapper around the buttons |
| `.ugoku-run-btn` | Run button |
| `.ugoku-stop-btn` | Stop button (shown while code is running) |
| `.ugoku-reset-btn` | Reset button (`run edit` blocks only) |

### Output panel

The console output panel comes with sensible default colors, each overridable via a CSS variable so you don't need to override the class itself:

| Class | CSS variable | Default |
| --- | --- | --- |
| `.ugoku-line-run-error`, `.ugoku-run-error-banner` | `--ugoku-color-error` | `#e5534b` |
| `.ugoku-string` | `--ugoku-color-string` | `#22863a` |
| `.ugoku-number` | `--ugoku-color-number` | `#005cc5` |
| `.ugoku-boolean`, `.ugoku-null` | `--ugoku-color-boolean` | `#d73a49` |
| `.ugoku-key` | `--ugoku-color-key` | `inherit` |
| `.ugoku-class-name` | `--ugoku-color-class` | `#6f42c1` |
| `.ugoku-special`, `.ugoku-punctuation`, `.ugoku-toggle`, `.ugoku-error-stack` | `--ugoku-color-special` / `--ugoku-color-punctuation` | `#6a737d` |

Each console line also gets `.ugoku-line-log`, `.ugoku-line-warn`, `.ugoku-line-error`, `.ugoku-line-info`, or `.ugoku-line-debug` depending on which `console.*` method produced it, alongside the shared `.ugoku-line` class.

### Edit overlay

`run edit` blocks render a transparent textarea over the highlighted code. Its font and padding read from your host's own CSS variables where available (e.g. VitePress's `--vp-code-*`), falling back to `--ugoku-font-edit-*` and `--ugoku-padding-edit-*` variables you can set yourself.

## Security

Code runs in a module Web Worker, which has no DOM access — but it's not a sandbox against your own origin. `fetch`/`XMLHttpRequest` calls made from inside it carry the same cookies as the page, so a block can call same-origin authenticated APIs. This applies equally to `run` and `run edit` blocks: editability doesn't grant new capabilities, it only changes who chooses the code that runs — the doc author for `run`, the reader for `run edit`. Since the reader is running their own code in their own session, this is closer to self-XSS than an attack on your site.

`run edit` persistence is scoped to `localStorage`, keyed by the block's source hash, and only ever written from the reader's own edits — there's no URL parameter or query string that seeds editor content. If you build anything on top of ugoku that shares or links to an edited snippet (e.g. a "share this" URL), threat-model it first — that's exactly the kind of feature that would let a third party's code land in someone else's session.

The console output panel renders every value via `textContent`, never `innerHTML`, so crafted output like `console.log('<img onerror=...>')` can't execute in the page.

If your site has a Content-Security-Policy, module workers created from a `Blob:` URL need `worker-src blob:` (or `child-src blob:` as a fallback). Without it, ugoku fails closed — the Run button just won't work — rather than failing open.

## What's next

- See the [Roadmap](./roadmap) for what's shipped and what's coming.
- Browse the packages on [npm](https://www.npmjs.com/org/ugoku).
- Source and issues live at [github.com/ugokujs/ugoku](https://github.com/ugokujs/ugoku).
