# Guide

## Installation

### VitePress

Install the packages:

```bash
pnpm add @ugoku/shiki @ugoku/vitepress
```

Register the transformer in your VitePress config:

```ts
// .vitepress/config.ts
import { defineConfig } from 'vitepress';
import { ugokuTransformer } from '@ugoku/shiki';

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
import { setupVitePressMount } from '@ugoku/vitepress';

export default {
  extends: DefaultTheme,
  enhanceApp({ router }) {
    setupVitePressMount(router);
  },
};
```

### Astro

Install the package:

```bash
pnpm add @ugoku/astro
```

Add the integration — it wires up both the Shiki transformer and the page script in one step:

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { ugoku } from '@ugoku/astro';

export default defineConfig({
  integrations: [ugoku()],
});
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

## What's next

- See the [Roadmap](./roadmap) for what's shipped and what's coming.
- Browse the packages on [npm](https://www.npmjs.com/org/ugoku).
- Source and issues live at [github.com/ugokujs/ugoku](https://github.com/ugokujs/ugoku).
