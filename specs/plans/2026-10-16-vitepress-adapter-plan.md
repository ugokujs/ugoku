# VitePress Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@ugoku/vitepress`, a tiny client-side adapter that wires `@ugoku/core`'s `mount()`/`unmount()` into VitePress's SPA route-change lifecycle, and loosen `@ugoku/shiki`'s peer dependency so it doesn't warn on every VitePress install.

**Architecture:** A new workspace package, `packages/vitepress`, exporting one function, `setupVitePressMount(router)`. It depends only on `@ugoku/core` (via pnpm's `workspace:*` protocol — confirmed working for both runtime resolution and `tsc` type-checking). No dependency on `vitepress` or `shiki` at all — the router parameter is structurally typed, and the browser guard is a local `typeof document !== 'undefined'` check, not an import. Tests run under the existing Node Vitest project (same one `@ugoku/shiki` uses), spying on `@ugoku/core`'s `mount`/`unmount`.

**Tech Stack:** TypeScript, Vitest (Node environment project — this package does no DOM manipulation of its own), pnpm workspace protocol.

## Global Constraints

- `@ugoku/vitepress` has exactly one dependency: `@ugoku/core` via `"workspace:*"`. No dependency (peer, dev, or otherwise) on `vitepress` or `shiki`.
- The router parameter is structurally typed inline — do not import VitePress's real `Router` type:
  ```ts
  {
    onBeforeRouteChange?: (to: string) => void | boolean | Promise<void | boolean>;
    onAfterRouteChange?: (to: string) => void | Promise<void>;
  }
  ```
- `onBeforeRouteChange` → `unmount(document.body)`; `onAfterRouteChange` → `mount(document.body)`. Not reversed — VitePress swaps the Vue tree between before/after, so unmounting after the swap would find nothing and leak the outgoing page's Worker (see spec's "Compatibility finding" / "The route-change hook" sections).
- The adapter **chains** existing hooks rather than clobbering them: if the router already has an `onBeforeRouteChange`/`onAfterRouteChange`, both the original and the adapter's own logic must run. For `onBeforeRouteChange`, the original's return value (including an explicit `false`, which cancels navigation) must still propagate.
- `setupVitePressMount` calls `mount(document.body)` once immediately when invoked (there's no route-change event for the very first page load).
- Every DOM-touching call is guarded by `typeof document !== 'undefined'` — this package must be safe to import and call during VitePress's build-time SSR pass, where `document` does not exist.
- `packages/shiki/package.json` additionally declares `peerDependenciesMeta: { "shiki": { "optional": true } }` — the peer dep itself stays (it documents the type contract), but consumers that never install `shiki` directly (every VitePress site) must not get a missing-peer warning.
- Tests run in the **node** Vitest project (add `packages/vitepress/**/*.test.ts` to its existing `include` glob in root `vitest.config.ts`) — no new Vitest project needed.
- To run only the node project's tests, use `npx vitest run --project node` directly. **Do not use `pnpm test -- --project node`** — this repo's `pnpm test` script does not forward the `--project` flag correctly; it silently runs the full workspace suite (both projects) instead of filtering. This was confirmed directly during this plan's pre-work.
- Minimal comments — only where something is genuinely non-obvious.

---

### Task 1: Loosen `@ugoku/shiki`'s peer dependency

**Files:**
- Modify: `packages/shiki/package.json`

**Interfaces:** None — this task has no code interface, just a manifest change.

**Context:** VitePress 1.6.4 bundles Shiki v2.5.0 internally; a VitePress site never installs `shiki` itself. `@ugoku/shiki`'s current `peerDependencies: { "shiki": "^4.0.0" }` would sit permanently unsatisfied for every VitePress consumer, triggering a missing-peer-dependency warning from their package manager. The fix is to mark the peer as optional, not to remove it (it still documents the type contract for anyone calling `codeToHtml` directly).

- [ ] **Step 1: Edit `packages/shiki/package.json`**

Current content:

```json
{
  "name": "@ugoku/shiki",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "peerDependencies": {
    "shiki": "^4.0.0"
  },
  "devDependencies": {
    "shiki": "^4.5.0"
  }
}
```

Change to:

```json
{
  "name": "@ugoku/shiki",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "peerDependencies": {
    "shiki": "^4.0.0"
  },
  "peerDependenciesMeta": {
    "shiki": {
      "optional": true
    }
  },
  "devDependencies": {
    "shiki": "^4.5.0"
  }
}
```

- [ ] **Step 2: Reinstall and confirm no workspace breakage**

Run: `pnpm install`
Expected: completes with no errors (this is a manifest-only change — no new dependency resolution needed).

- [ ] **Step 3: Run the full suite to confirm nothing regressed**

Run: `pnpm test`
Expected: `Test Files 10 passed (10)`, `Tests 64 passed (64)` (same baseline as before this change — a `peerDependenciesMeta` edit has no runtime effect).

Run: `pnpm typecheck`
Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
git add packages/shiki/package.json
git commit -m "fix: mark @ugoku/shiki's shiki peer dependency as optional"
```

---

### Task 2: `@ugoku/vitepress` adapter package

**Files:**
- Create: `packages/vitepress/package.json`
- Modify: `vitest.config.ts` (root)
- Create: `packages/vitepress/src/setup-vitepress-mount.ts`
- Create: `packages/vitepress/src/index.ts`
- Test: `packages/vitepress/src/setup-vitepress-mount.test.ts`

**Interfaces:**
- Consumes: `mount(root: ParentNode): void` and `unmount(root: ParentNode): void`, exported from `@ugoku/core` (confirmed present at `packages/core/src/index.ts`).
- Produces: `setupVitePressMount(router: VitePressRouterLike): void`, exported from `@ugoku/vitepress`'s package entry point (`src/index.ts`), where:
  ```ts
  interface VitePressRouterLike {
    onBeforeRouteChange?: (to: string) => void | boolean | Promise<void | boolean>;
    onAfterRouteChange?: (to: string) => void | Promise<void>;
  }
  ```

**Context:** This is the package's entire scope — one function, no DOM manipulation of its own (that's `@ugoku/core`'s job), no dependency on `vitepress` or `shiki`. Confirmed during this plan's pre-work: pnpm's `workspace:*` protocol correctly symlinks `packages/vitepress/node_modules/@ugoku/core -> ../../../core` and resolves both at runtime (Vitest) and at the type level (`tsc --noEmit`).

- [ ] **Step 1: Create the package manifest**

Create `packages/vitepress/package.json`:

```json
{
  "name": "@ugoku/vitepress",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "@ugoku/core": "workspace:*"
  }
}
```

- [ ] **Step 2: Install to create the workspace symlink**

Run: `pnpm install`
Expected: completes with no errors; reports 4 workspace projects (core, shiki, vitepress, plus the root).

- [ ] **Step 3: Add this package's tests to the node Vitest project**

Edit root `vitest.config.ts`. Current content:

```ts
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'browser',
          include: ['packages/core/**/*.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        test: {
          name: 'node',
          include: ['packages/shiki/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
```

Change the `node` project's `include` array to:

```ts
          include: ['packages/shiki/**/*.test.ts', 'packages/vitepress/**/*.test.ts'],
```

Full resulting file:

```ts
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'browser',
          include: ['packages/core/**/*.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
      {
        test: {
          name: 'node',
          include: ['packages/shiki/**/*.test.ts', 'packages/vitepress/**/*.test.ts'],
          environment: 'node',
        },
      },
    ],
  },
});
```

- [ ] **Step 4: Write the failing tests**

Create `packages/vitepress/src/setup-vitepress-mount.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from '@ugoku/core';
import { setupVitePressMount } from './setup-vitepress-mount';

describe('setupVitePressMount', () => {
  let mountSpy: ReturnType<typeof vi.spyOn>;
  let unmountSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mountSpy = vi.spyOn(core, 'mount').mockImplementation(() => {});
    unmountSpy = vi.spyOn(core, 'unmount').mockImplementation(() => {});
  });

  afterEach(() => {
    mountSpy.mockRestore();
    unmountSpy.mockRestore();
  });

  it('is a no-op when document is undefined (Node environment)', () => {
    expect(typeof document).toBe('undefined');

    const router = {};
    setupVitePressMount(router);

    expect(mountSpy).not.toHaveBeenCalled();
    expect(unmountSpy).not.toHaveBeenCalled();
  });
});
```

This first test asserts the guard: this package's tests run under the `node` Vitest project, which has no `document` global by default, so it proves the `typeof document !== 'undefined'` guard for free — no jsdom needed. The remaining tests (Step 7) need a `document` global to exercise the mount/unmount paths, so they stub one directly.

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run --project node`
Expected: FAIL — `Cannot find module './setup-vitepress-mount'` (file doesn't exist yet).

- [ ] **Step 6: Write the minimal implementation to pass the first test**

Create `packages/vitepress/src/setup-vitepress-mount.ts`:

```ts
import { mount, unmount } from '@ugoku/core';

interface VitePressRouterLike {
  onBeforeRouteChange?: (to: string) => void | boolean | Promise<void | boolean>;
  onAfterRouteChange?: (to: string) => void | Promise<void>;
}

export function setupVitePressMount(router: VitePressRouterLike): void {
  if (typeof document === 'undefined') return;

  const originalBefore = router.onBeforeRouteChange;
  const originalAfter = router.onAfterRouteChange;

  router.onBeforeRouteChange = async (to) => {
    unmount(document.body);
    if (originalBefore) return originalBefore(to);
  };

  router.onAfterRouteChange = async (to) => {
    mount(document.body);
    if (originalAfter) return originalAfter(to);
  };

  mount(document.body);
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run --project node`
Expected: PASS (1 test).

- [ ] **Step 8: Write the remaining tests**

Append to `packages/vitepress/src/setup-vitepress-mount.test.ts` (inside the same `describe` block, after the existing test):

```ts
  it('mounts immediately when document exists', () => {
    (globalThis as { document?: object }).document = { body: {} };

    const router = {};
    setupVitePressMount(router);

    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(mountSpy).toHaveBeenCalledWith((globalThis as { document: { body: object } }).document.body);

    delete (globalThis as { document?: object }).document;
  });

  it('unmounts on onBeforeRouteChange and mounts on onAfterRouteChange', async () => {
    (globalThis as { document?: object }).document = { body: {} };

    const router: {
      onBeforeRouteChange?: (to: string) => void | boolean | Promise<void | boolean>;
      onAfterRouteChange?: (to: string) => void | Promise<void>;
    } = {};
    setupVitePressMount(router);
    mountSpy.mockClear();

    await router.onBeforeRouteChange?.('/next-page');
    expect(unmountSpy).toHaveBeenCalledTimes(1);
    expect(mountSpy).not.toHaveBeenCalled();

    await router.onAfterRouteChange?.('/next-page');
    expect(mountSpy).toHaveBeenCalledTimes(1);

    delete (globalThis as { document?: object }).document;
  });

  it('preserves onBeforeRouteChange cancellation semantics when chaining', async () => {
    (globalThis as { document?: object }).document = { body: {} };

    const originalBefore = vi.fn().mockReturnValue(false);
    const router: {
      onBeforeRouteChange?: (to: string) => void | boolean | Promise<void | boolean>;
    } = { onBeforeRouteChange: originalBefore };
    setupVitePressMount(router);

    const result = await router.onBeforeRouteChange?.('/next-page');

    expect(unmountSpy).toHaveBeenCalledTimes(1);
    expect(originalBefore).toHaveBeenCalledWith('/next-page');
    expect(result).toBe(false);

    delete (globalThis as { document?: object }).document;
  });

  it('chains both existing hooks without clobbering them', async () => {
    (globalThis as { document?: object }).document = { body: {} };

    const originalBefore = vi.fn();
    const originalAfter = vi.fn();
    const router: {
      onBeforeRouteChange?: (to: string) => void | boolean | Promise<void | boolean>;
      onAfterRouteChange?: (to: string) => void | Promise<void>;
    } = { onBeforeRouteChange: originalBefore, onAfterRouteChange: originalAfter };
    setupVitePressMount(router);

    await router.onBeforeRouteChange?.('/next-page');
    await router.onAfterRouteChange?.('/next-page');

    expect(originalBefore).toHaveBeenCalledWith('/next-page');
    expect(originalAfter).toHaveBeenCalledWith('/next-page');

    delete (globalThis as { document?: object }).document;
  });
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npx vitest run --project node`
Expected: PASS (5 tests).

- [ ] **Step 10: Create the package entry point**

Create `packages/vitepress/src/index.ts`:

```ts
export { setupVitePressMount } from './setup-vitepress-mount';
```

- [ ] **Step 11: Run the full suite and typecheck**

Run: `pnpm test`
Expected: `Test Files 11 passed (11)`, `Tests 69 passed (69)` (64 previous + 5 new).

Run: `pnpm typecheck`
Expected: no output, exit code 0.

- [ ] **Step 12: Commit**

```bash
git add packages/vitepress vitest.config.ts
git commit -m "feat: add @ugoku/vitepress adapter for SPA route-change mounting"
```
