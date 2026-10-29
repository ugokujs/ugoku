---
layout: home
hero:
  name: "ugoku"
  tagline: "Add <code>run</code> to a code fence and readers get a Run button with live console output. No server involved, and it keeps working offline."
  actions:
    - theme: brand
      text: "Get Started"
      link: "/guide"
    - theme: alt
      text: "GitHub"
      link: "https://github.com/ugokujs/ugoku"
features:
  - title: "Local-first"
    details: "Runs entirely in the browser through a Web Worker, so it keeps working offline after the first load."
  - title: "Real console output"
    details: "Captures <code>console.*</code> output as it streams in, with top-level <code>await</code>, a timeout, and a Stop button for runaway code."
  - title: "Editable, when you want"
    details: "<code>run edit</code> blocks let readers tweak the code. Edits persist in <code>localStorage</code> and clear automatically once the author changes the snippet."
  - title: "Drop-in adapters"
    details: "One-line setup for VitePress or plain Astro, no extra build step."
---

## Try it

A few variations of the same idea: run-only, editable, TypeScript, TypeScript combined with editing, and fetching data.

### Run-only

A plain `run` block. Readers can execute it, but not edit it.

```js run
console.log('hello from home');
```

### Editable

Add `edit` to the fence info string to let readers modify the code. Edits persist in `localStorage`, keyed to the block's source — if the author changes the example, the hash changes too and any stale edit is discarded automatically.

```js run edit
let total = 0;
for (let i = 1; i <= 5; i++) {
  total += i;
}
console.log('total:', total);
```

### TypeScript

Use a `ts` fence for TypeScript. Types are stripped at runtime (not type-checked) before the code runs.

```ts run
function add(a: number, b: number): number {
  return a + b;
}
console.log('sum:', add(2, 3));
```

### TypeScript, editable

`ts` and `edit` combine the same way — lazy type-stripping on run, lazy re-highlighting and persistence on edit.

```ts run edit
interface Point {
  x: number;
  y: number;
}
function distance(p: Point): number {
  return Math.sqrt(p.x * p.x + p.y * p.y);
}
console.log('distance:', distance({ x: 3, y: 4 }));
```

### Fetching data

Regular `fetch()` works inside the worker — this one hits a static JSON file served by this site. Relative paths don't resolve inside the worker's `blob:` URL, so build an absolute URL from `self.origin` first.

```js run
const res = await fetch(new URL('/example-data.json', self.origin));
const data = await res.json();
console.log(data);
```

[More examples](./page2)
