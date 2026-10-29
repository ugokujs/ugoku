# @ugoku/vitepress

## 0.2.0

### Minor Changes

- 70c53f2: `@ugoku/vitepress` now depends on `@ugoku/shiki` and re-exports `ugokuTransformer`, so VitePress users install and import from a single package instead of two.
  
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

## 0.1.1

### Patch Changes

- 1fd8164: Add a README to each published package.
- Updated dependencies [1fd8164]
  - @ugoku/core@0.1.1
