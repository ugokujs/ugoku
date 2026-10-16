# Docs Dogfood Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real `docs/` VitePress dogfood site CLAUDE.md describes, wiring `@ugoku/shiki` and `@ugoku/vitepress` into an actual VitePress project for the first time outside a throwaway manual-testing setup, plus a permanent Playwright e2e suite that exercises it as a real production build.

**Architecture:** Relocate the existing planning archive out of `docs/` (since `docs/` is about to become a real VitePress project and can't also hold non-site markdown), scaffold `docs/` as a minimal two-page VitePress site, then add a top-level `e2e/` package whose Playwright config builds and previews the real site before running assertions against it.

**Tech Stack:** VitePress 1.6.4, `@playwright/test`, pnpm workspace protocol.

## Global Constraints

- `docs/superpowers/{specs,plans}` relocates to `specs/{specs,plans}` at the repo root — a pure `git mv`, no content rewriting.
- `docs/` becomes the VitePress project root directly (not nested under a subfolder) — `docs/.vitepress/`, `docs/index.md`, `docs/page2.md`, `docs/package.json`.
- `docs/package.json` depends on `@ugoku/core`, `@ugoku/shiki`, `@ugoku/vitepress` via `"workspace:*"`, and `vitepress` pinned to exactly `"1.6.4"` (the version already confirmed to bundle Shiki v2.5.0 and work correctly with this repo's transformer/adapter).
- Site content is minimal: exactly two pages (`index.md`, `page2.md`), one `run` block and one `run edit` block on the home page, one `run` block on page 2, each linking to the other.
- `e2e/` is a separate top-level package depending on `@playwright/test` pinned to `"^1.64.1"` (matches the root's existing bare `playwright` devDependency version, so both resolve to the same installed browser binaries).
- `e2e/playwright.config.ts`'s `webServer` runs a real `vitepress build` followed by `vitepress preview` (not `vitepress dev`) — the e2e suite tests the actual production artifact.
- `pnpm-workspace.yaml` gains two permanent entries: `docs` and `e2e`.
- Root `package.json` gains two convenience scripts: `"test:e2e"` and `"dev:docs"`.
- Root `vitest.config.ts` is untouched — neither `docs/` nor `e2e/` contain `.test.ts` files for Vitest to pick up.
- Out of scope: any content beyond the two minimal pages; `--vp-code-*` visual theming; CI wiring; any changes to `@ugoku/core`, `@ugoku/shiki`, or `@ugoku/vitepress` themselves.

---

### Task 1: Relocate the planning archive

**Files:**
- Move: `docs/superpowers/specs/` → `specs/specs/`
- Move: `docs/superpowers/plans/` → `specs/plans/`

**Interfaces:** None — this is a pure directory relocation with no code interface.

**Context:** `docs/` is about to become a real VitePress project root. VitePress treats every `.md` file under its root as site content to render, so the existing planning archive (`docs/superpowers/specs/*.md`, `docs/superpowers/plans/*.md` — six spec files and six plan files by the time this task runs, including this plan document and its own spec, since the plan is committed to its default location before this task's branch is cut) must move out first, or VitePress would try to render them as pages. `git mv` on the whole directory sweeps up every file inside it in one operation — no file needs individual handling.

- [ ] **Step 1: Move the archive**

```bash
mkdir -p specs
git mv docs/superpowers/specs specs/specs
git mv docs/superpowers/plans specs/plans
```

- [ ] **Step 2: Remove the now-empty parent directory**

```bash
rmdir docs/superpowers 2>/dev/null || true
ls docs/
```
Expected: `docs/` is now empty (or shows only stray OS files like `.DS_Store` — remove those too if present: `git rm --cached docs/.DS_Store 2>/dev/null; rm -f docs/.DS_Store`).

- [ ] **Step 3: Verify the move preserved history and content**

```bash
ls specs/specs/ specs/plans/
git log --oneline -3 -- specs/plans/2026-10-16-docs-dogfood-site-plan.md
```
Expected: both directories list all six of their `.md` files each, and the `git log` command shows this file's prior history (from its `git mv`, confirming `git mv` preserved blame/history rather than deleting and re-adding).

- [ ] **Step 4: Run the existing test suite to confirm nothing depends on the old path**

Run: `pnpm test && pnpm typecheck`
Expected: `Test Files 11 passed (11)`, `Tests 72 passed (72)`, typecheck exits 0 with no output. (Nothing in `packages/*/src` references `docs/superpowers` — this is a pure documentation-directory move with no code impact.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: relocate planning archive from docs/superpowers to specs/"
```

---

### Task 2: Scaffold the docs/ VitePress site

**Files:**
- Create: `docs/package.json`
- Create: `docs/.vitepress/config.ts`
- Create: `docs/.vitepress/theme/index.ts`
- Create: `docs/index.md`
- Create: `docs/page2.md`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json` (root)

**Interfaces:**
- Consumes: `ugokuTransformer()` from `@ugoku/shiki` (`packages/shiki/src/index.ts`); `setupVitePressMount(router)` from `@ugoku/vitepress` (`packages/vitepress/src/index.ts`).
- Produces: a working VitePress site at `docs/`, installable via `pnpm install` from the repo root once `pnpm-workspace.yaml` includes it, runnable via `pnpm --filter ugoku-docs dev` / `build` / `preview`.

**Context:** This task's file contents are a byte-for-byte reuse of a configuration already proven live against a real VitePress 1.6.4 dev server and a real `vitepress build` + `vitepress preview` production run earlier in this project's development — confirmed working with the shipped `@ugoku/shiki` transformer and `@ugoku/vitepress` adapter (including their initial-mount-timing and explicit-`.ts`-extension fixes). There is no remaining design risk here, only execution.

- [ ] **Step 1: Add `docs` to the pnpm workspace**

Edit `pnpm-workspace.yaml`. Current content:
```yaml
packages:
  - 'packages/*'
```
New content:
```yaml
packages:
  - 'packages/*'
  - 'docs'
```
(Task 3 adds `e2e` to this same file in its own Step 1 — kept separate so each task's `pnpm install` only ever points at directories that already exist.)

- [ ] **Step 2: Create `docs/package.json`**

```json
{
  "name": "ugoku-docs",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vitepress dev .",
    "build": "vitepress build .",
    "preview": "vitepress preview ."
  },
  "devDependencies": {
    "vitepress": "1.6.4"
  },
  "dependencies": {
    "@ugoku/core": "workspace:*",
    "@ugoku/shiki": "workspace:*",
    "@ugoku/vitepress": "workspace:*"
  }
}
```

- [ ] **Step 3: Create `docs/.vitepress/config.ts`**

```ts
import { defineConfig } from 'vitepress';
import { ugokuTransformer } from '@ugoku/shiki';

export default defineConfig({
  title: 'ugoku',
  markdown: {
    codeTransformers: [ugokuTransformer()],
  },
});
```

- [ ] **Step 4: Create `docs/.vitepress/theme/index.ts`**

```ts
import DefaultTheme from 'vitepress/theme';
import { setupVitePressMount } from '@ugoku/vitepress';

export default {
  extends: DefaultTheme,
  enhanceApp({ router }) {
    setupVitePressMount(router);
  },
};
```

- [ ] **Step 5: Create `docs/index.md`**

````md
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

[Go to page 2](./page2)
````

- [ ] **Step 6: Create `docs/page2.md`**

````md
# Page 2

```js run
console.log('hello from page 2');
```

[Go home](./)
````

- [ ] **Step 7: Install dependencies**

Run: `pnpm install`
Expected: completes with no errors; reports 5 workspace projects (core, shiki, vitepress, docs, plus the root).

- [ ] **Step 8: Build the site to confirm it works end-to-end**

Run: `pnpm --filter ugoku-docs build`
Expected: output ending in `✓ building client + server bundles...` and `✓ rendering pages...`, exit code 0, with a new `docs/.vitepress/dist/` directory created.

- [ ] **Step 9: Spot-check the built output carries ugoku's attributes**

```bash
grep -o 'data-ugoku-mode="[^"]*"' docs/.vitepress/dist/index.html
grep -o 'data-ugoku-mode="[^"]*"' docs/.vitepress/dist/page2.html
```
Expected: `docs/.vitepress/dist/index.html` shows two matches (`data-ugoku-mode="run"` and `data-ugoku-mode="run-edit"`); `docs/.vitepress/dist/page2.html` shows one match (`data-ugoku-mode="run"`).

- [ ] **Step 10: Add root convenience scripts**

Edit root `package.json`. Current `scripts` block:
```json
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
```
New `scripts` block:
```json
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "dev:docs": "pnpm --filter ugoku-docs dev"
  },
```
(`test:e2e` is added in Task 3's own root `package.json` edit, once the `e2e` package exists — same ordering rationale as Step 7.)

- [ ] **Step 11: Run the full existing test suite to confirm no regression**

Run: `pnpm test && pnpm typecheck`
Expected: `Test Files 11 passed (11)`, `Tests 72 passed (72)`, typecheck exits 0 with no output.

- [ ] **Step 12: Commit**

```bash
git add docs pnpm-workspace.yaml package.json pnpm-lock.yaml
git commit -m "feat: scaffold docs/ as the real VitePress dogfood site"
```

---

### Task 3: Playwright e2e suite against the real build

**Files:**
- Create: `e2e/package.json`
- Create: `e2e/playwright.config.ts`
- Create: `e2e/dogfood.spec.ts`
- Modify: `pnpm-workspace.yaml`
- Modify: `package.json` (root)

**Interfaces:**
- Consumes: the running `docs/` site (via `pnpm --filter ugoku-docs build` + `preview`, started automatically by Playwright's `webServer` config) and its rendered DOM contract: `pre[data-ugoku-mode]` with `data-ugoku-mounted="true"` once mounted, `.ugoku-run-btn` to trigger a run, `.ugoku-output-panel` for console output, `.ugoku-controls` as the per-block wrapper inserted by `mount()` (all confirmed present in `packages/core/src/mount/mount.ts`).
- Produces: `pnpm --filter ugoku-e2e test` as the command to run this suite.

**Context:** This exact configuration (webServer command, port, and all three assertions below) was verified working end-to-end in a throwaway spike before this plan was written: `pnpm --filter <docs-pkg-name> build && pnpm --filter <docs-pkg-name> preview`, served on VitePress's default preview port `4173`, with both spec tests passing against the real production build.

- [ ] **Step 1: Add `e2e` to the pnpm workspace**

Edit `pnpm-workspace.yaml`. Current content (after Task 2):
```yaml
packages:
  - 'packages/*'
  - 'docs'
```
New content:
```yaml
packages:
  - 'packages/*'
  - 'docs'
  - 'e2e'
```

- [ ] **Step 2: Create `e2e/package.json`**

```json
{
  "name": "ugoku-e2e",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.64.1"
  }
}
```

- [ ] **Step 3: Create `e2e/playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  webServer: {
    command: 'pnpm --filter ugoku-docs build && pnpm --filter ugoku-docs preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  use: {
    baseURL: 'http://localhost:4173',
  },
});
```

- [ ] **Step 4: Create `e2e/dogfood.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('home page mounts run and run-edit blocks and Run produces output', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('pre[data-ugoku-mode="run"]')).toHaveAttribute('data-ugoku-mounted', 'true');
  await expect(page.locator('pre[data-ugoku-mode="run-edit"]')).toHaveAttribute('data-ugoku-mounted', 'true');

  await page.locator('.ugoku-run-btn').first().click();
  await expect(page.locator('.ugoku-output-panel').first()).toContainText('hello from home');
});

test('SPA navigation unmounts the old page and mounts the new one', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Go to page 2' }).click();
  await page.waitForURL('**/page2*');

  await expect(page.locator('.ugoku-controls')).toHaveCount(1);
  await expect(page.locator('pre[data-ugoku-mode]')).toHaveAttribute('data-ugoku-mounted', 'true');

  await page.locator('.ugoku-run-btn').first().click();
  await expect(page.locator('.ugoku-output-panel').first()).toContainText('hello from page 2');
});
```

- [ ] **Step 5: Install dependencies**

Run: `pnpm install`
Expected: completes with no errors; reports 6 workspace projects (core, shiki, vitepress, docs, e2e, plus the root).

- [ ] **Step 6: Run the e2e suite**

Run: `pnpm --filter ugoku-e2e test`
Expected: output includes `building client + server bundles...`, `rendering pages...`, then:
```
Running 2 tests using 1 worker

  ✓  1 dogfood.spec.ts:3:1 › home page mounts run and run-edit blocks and Run produces output
  ✓  2 dogfood.spec.ts:12:1 › SPA navigation unmounts the old page and mounts the new one

  2 passed
```

- [ ] **Step 7: Add the e2e convenience script to root `package.json`**

Edit root `package.json`. Current `scripts` block (after Task 2):
```json
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "dev:docs": "pnpm --filter ugoku-docs dev"
  },
```
New `scripts` block:
```json
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "dev:docs": "pnpm --filter ugoku-docs dev",
    "test:e2e": "pnpm --filter ugoku-e2e test"
  },
```

- [ ] **Step 8: Run the full existing Vitest suite and typecheck to confirm no regression**

Run: `pnpm test && pnpm typecheck`
Expected: `Test Files 11 passed (11)`, `Tests 72 passed (72)`, typecheck exits 0 with no output. (`e2e/`'s `.spec.ts` file is a Playwright test, not picked up by either Vitest project's `include` glob — this command must still show exactly 72 Vitest tests, not more.)

- [ ] **Step 9: Commit**

```bash
git add e2e pnpm-workspace.yaml package.json pnpm-lock.yaml
git commit -m "test: add Playwright e2e suite against the real docs build"
```
