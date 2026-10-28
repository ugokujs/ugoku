# @ugoku/vitepress

VitePress adapter for [ugoku](https://github.com/ugokujs/ugoku): runnable, editable code snippets for Shiki-highlighted fences, with no server and no DOM/iframe — console output only.

## Setup

Register the [`@ugoku/shiki`](https://www.npmjs.com/package/@ugoku/shiki) transformer in your VitePress config:

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

Then hook the mount into your theme, so ugoku re-scans on VitePress's SPA route changes, not just on first load:

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

## Usage

Add `run` or `run edit` to a fence's info string:

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

`run` is run-only; `run edit` additionally shows an editable overlay over the highlighted block, with edits persisted to `localStorage` per snippet.

TypeScript blocks (`ts`) have their type annotations stripped in-browser (no type-checking) before execution.

See the [main README](https://github.com/ugokujs/ugoku#readme) for the full picture, and the [docs site](https://github.com/ugokujs/ugoku/tree/main/docs) for a live dogfooded example.
