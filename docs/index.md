# Home

ugoku turns a code fence into a runnable snippet. Add `run` for a Run button and console output, or `run edit` to also let readers modify the code.

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

[Go to page 2](./page2)
