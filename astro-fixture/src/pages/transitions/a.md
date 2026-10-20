---
layout: ../../layouts/Transitions.astro
title: Transitions A
---

# Transitions A

```js run
console.log('hello from transitions a');
```

```js run edit
while (true) {
  console.log('tick');
  await new Promise((resolve) => setTimeout(resolve, 50));
}
```

[Go to B](/transitions/b)
