# @ugoku/shiki

The build-time [Shiki](https://shiki.style/) transformer for [ugoku](https://github.com/ugokujs/ugoku). Reads a code fence's meta string and, for `run`/`run edit` blocks, stamps the rendered `<pre>` with data attributes `@ugoku/core` reads at runtime (mode, language, theme(s), source hash). Blocks without `run` are left untouched.

## Usage

```ts
import { ugokuTransformer } from '@ugoku/shiki';

const transformer = ugokuTransformer();
```

Pass it wherever your Shiki setup accepts transformers — e.g. VitePress's `markdown.codeTransformers`, or Shiki's own `codeToHtml({ transformers: [...] })`.

In markdown, add `run` (run-only) or `run edit` (editable) to the fence info string, alongside whatever else your pipeline already parses there (line numbers, filenames, etc.):

````md
```js run
console.log('hello');
```
````

## Who should use this directly

If you're using the VitePress or Astro adapter, it already wires this in for you — see [`@ugoku/vitepress`](https://www.npmjs.com/package/@ugoku/vitepress) or [`@ugoku/astro`](https://www.npmjs.com/package/@ugoku/astro). Use this package directly only if you're building a custom Shiki integration.

See the [main README](https://github.com/ugokujs/ugoku#readme) for the full picture.
