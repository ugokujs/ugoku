# @ugoku/astro

Astro adapter for [ugoku](https://github.com/ugokujs/ugoku): runnable, editable code snippets for Shiki-highlighted fences, with no server and no DOM/iframe — console output only.

A single integration auto-wires both the `@ugoku/shiki` transformer and the page script, for plain Astro's MPA navigation and `<ClientRouter />` transitions alike. (This is for plain Astro — Astro Starlight replaces Shiki with its own highlighter and needs a separate adapter.)

## Setup

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config';
import { ugoku } from '@ugoku/astro';

export default defineConfig({
  integrations: [ugoku()],
});
```

That's it — no second manual step, no theme file to edit.

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

See the [main README](https://github.com/ugokujs/ugoku#readme) for the full picture.
