import { expect, test } from 'vitest';
import { stripTypes } from './strip';

function runStripped(code: string): unknown[] {
  const logs: unknown[] = [];
  const fakeConsole = { log: (...args: unknown[]) => logs.push(...args) };
  // eslint-disable-next-line no-new-func
  new Function('console', stripTypes(code))(fakeConsole);
  return logs;
}

test('strips interface declarations and type annotations, producing runnable JS', () => {
  const logs = runStripped(`interface Point { x: number; y: number; }
function add(a: number, b: number): number {
  return a + b;
}
console.log(add(1, 2));`);
  expect(logs).toEqual([3]);
});

test('strips generic type parameters', () => {
  const logs = runStripped(`function identity<T>(x: T): T { return x; }
console.log(identity<string>("hi"));`);
  expect(logs).toEqual(['hi']);
});

test('strips "as" type casts', () => {
  const logs = runStripped(`const x = (1 as unknown) as string;
console.log(x);`);
  expect(logs).toEqual([1]);
});

test('transforms enums into runnable JS', () => {
  const logs = runStripped(`enum Color { Red, Green, Blue }
console.log(Color.Green);`);
  expect(logs).toEqual([1]);
});

test('removes type-only imports entirely, leaving runnable JS', () => {
  const logs = runStripped(`import type { Foo } from "./foo";
const x: number = 1;
console.log(x);`);
  expect(logs).toEqual([1]);
});

test('throws on a genuine syntax error unrelated to type annotations', () => {
  expect(() => stripTypes('const x = ;')).toThrow();
});
