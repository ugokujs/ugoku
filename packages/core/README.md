# @ugoku/core

Runtime for [ugoku](https://github.com/ugokujs/ugoku): the Web Worker runner, streamed console output panel, and (lazily loaded) edit overlay + TypeScript stripping. Framework adapters (`@ugoku/vitepress`, `@ugoku/astro`) depend on this package; most users won't import it directly.

Everything runs fully in-browser — no server, works offline after first load.

## What it does

- Reads `<pre>` elements stamped by [`@ugoku/shiki`](https://www.npmjs.com/package/@ugoku/shiki)'s transformer and mounts a Run button + output panel.
- Executes code in a module Web Worker (built from a Blob URL): real top-level `await`, a timeout, and a Stop button via `worker.terminate()`.
- Streams `console.*` output back to the main thread as it arrives.
- `run edit` blocks: a transparent textarea overlay over the highlighted code, with lazy Shiki re-highlighting loaded on first focus. Edits persist to `localStorage` keyed by a source hash, with a Reset button; if the author changes the snippet, the hash changes and stale edits are discarded automatically.

## API

```ts
import { mount, unmount } from '@ugoku/core';

mount(document.body); // scan a root for ugoku blocks and wire them up
unmount(document.body); // tear down listeners/workers before removing the DOM
```

`mount`/`unmount` touch only the DOM — call them explicitly (e.g. on route change in an SPA). They don't run on import and don't scan automatically on `DOMContentLoaded`.

Also exported: `runCode` (the worker runner used internally by `mount`) and `OutputPanel`/`renderValue` (the output panel and its value serializer), for adapters or advanced use.

## Who should use this directly

Most readers want an adapter instead:

- [`@ugoku/vitepress`](https://www.npmjs.com/package/@ugoku/vitepress) for VitePress
- [`@ugoku/astro`](https://www.npmjs.com/package/@ugoku/astro) for plain Astro

See the [main README](https://github.com/ugokujs/ugoku#readme) for the full picture.
