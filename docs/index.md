# Home

```js run
console.log('hello from home');
```

```js run edit
let total = 0;
for (let i = 1; i <= 5; i++) {
  total += i;
}
console.log('total:', total);
```

```ts run
function add(a: number, b: number): number {
  return a + b;
}
console.log('sum:', add(2, 3));
```

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
