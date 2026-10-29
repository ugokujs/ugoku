---
"@ugoku/vitepress": minor
---

`@ugoku/vitepress` now depends on `@ugoku/shiki` and re-exports `ugokuTransformer`, so VitePress users install and import from a single package instead of two.

**Breaking:** `setupVitePressMount` moves to the `@ugoku/vitepress/client` subpath (it's bundled into the browser theme, which must not pull in `@ugoku/shiki`'s Node-only `node:crypto` usage). Update:

```diff
-import { setupVitePressMount } from '@ugoku/vitepress';
+import { setupVitePressMount } from '@ugoku/vitepress/client';
```

`ugokuTransformer` can now be imported from `@ugoku/vitepress` directly instead of `@ugoku/shiki`:

```diff
-import { ugokuTransformer } from '@ugoku/shiki';
+import { ugokuTransformer } from '@ugoku/vitepress';
```
