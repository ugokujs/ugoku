# More examples

A couple more things the console panel handles: expandable composite values and formatted errors. Getting to this page also proves VitePress's SPA router works correctly with ugoku — moving between pages unmounts the blocks you're leaving and mounts the ones you land on, without a full reload.

```js run
console.log('hello from page 2');
```

### Composite values

Objects and arrays are expandable — click one to drill in.

```js run
console.log({ user: { name: 'Ada', roles: ['admin', 'editor'] }, active: true });
```

### Errors

Thrown errors render with their stack trace.

```js run
function parse(input) {
  throw new Error(`could not parse "${input}"`);
}
parse('not json');
```

[← Back home](./)
