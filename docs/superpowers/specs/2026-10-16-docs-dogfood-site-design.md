# Docs dogfood site design

Date: 2026-10-16

## Purpose & scope

Build the real `docs/` VitePress site CLAUDE.md describes ("Dogfood target: VitePress first" / "every runnable example is also a test case"), wiring `@ugoku/shiki` and `@ugoku/vitepress` into an actual VitePress project for the first time outside a throwaway manual-testing setup, plus a permanent Playwright e2e suite that exercises it as a real production build.

This plan covers:
- Relocating the existing planning archive (`docs/superpowers/{specs,plans}`) out of `docs/`, since `docs/` is about to become a real VitePress project and can't also hold non-site markdown.
- Scaffolding `docs/` as a VitePress site with minimal content: two pages, exercising both `run` and `run edit` fence modes and an SPA navigation between them.
- A new top-level `e2e/` package with Playwright tests against a real `vitepress build` + `vitepress preview`.

**Out of scope:** a getting-started guide or API reference beyond the two minimal pages; `--vp-code-*` visual theming; CI wiring (this repo has no CI configured yet); any changes to `@ugoku/core`, `@ugoku/shiki`, or `@ugoku/vitepress` themselves.

## Directory layout

`docs/superpowers/{specs,plans}` (the planning archive this whole project's brainstorming/writing-plans cycle has been writing to) relocates to a new top-level `specs/` directory, preserving its two subfolders as-is (`specs/specs/`, `specs/plans/`) — a pure `git mv`, no content rewriting, no change to any other skill's default save path since `writing-plans`/`brainstorming`'s default (`docs/superpowers/...`) is itself what's being relocated; all future specs/plans this session (including this one) land at the new path once the move happens.

`docs/` becomes the real VitePress project root — `docs/.vitepress/`, `docs/index.md`, `docs/page2.md`, `docs/package.json` — registered permanently in the root `pnpm-workspace.yaml`.

`e2e/` is a new top-level package (its own `package.json`, Playwright config, spec file), also registered permanently in `pnpm-workspace.yaml`.

## Site content & structure

Two pages, matching exactly what was manually verified to work end-to-end against a real VitePress 1.6.4 instance earlier this session:

`docs/index.md`:
```md
# Home

​```js run
console.log('hello from home');
​```

​```js run edit
let total = 0;
for (let i = 1; i <= 5; i++) {
  total += i;
}
console.log('total:', total);
​```

[Go to page 2](./page2)
```

`docs/page2.md`:
```md
# Page 2

​```js run
console.log('hello from page 2');
​```

[Go home](./)
```

This exercises both fence modes (`run edit`'s actual editor overlay isn't built yet — v0.2 — so it currently behaves identically to `run`, same as every other `run edit` block in this repo so far) and gives the e2e suite a real SPA navigation to assert against.

## Site config & wiring

`docs/package.json`:
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

`docs/.vitepress/config.ts`:
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

`docs/.vitepress/theme/index.ts`:
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

This is a byte-for-byte reuse of the pattern already proven live against a real VitePress dev server this session (including the initial-mount timing fix and the explicit-`.ts`-extensions fix, both already shipped in `@ugoku/vitepress`/`@ugoku/shiki`/`@ugoku/core`) — no new design risk, just making it permanent and committed.

## e2e/ setup

`e2e/package.json`:
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

(`^1.64.1` matches the root's existing bare `playwright` devDependency version, so both resolve to the same installed browser binaries — no duplicate browser downloads.)

`e2e/playwright.config.ts` — a `webServer` block that builds the site and serves the production preview before tests run, with `reuseExistingServer` so local iteration doesn't rebuild every run:
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

`e2e/dogfood.spec.ts` — one spec file, assertions matching what was manually verified via a throwaway Playwright script earlier this session, now permanent and run against the real production build:
1. On the home page, the `run` block's `<pre>` carries `data-ugoku-mode="run"` and the `run edit` block's carries `data-ugoku-mode="run-edit"`; both reach `data-ugoku-mounted="true"` after load (this specifically re-proves the initial-mount timing fix holds under a real production build, not just dev mode).
2. Clicking Run on the home page's first block produces the expected console output in its output panel.
3. Navigating to page 2 via the in-page link leaves exactly one `.ugoku-controls` element on the page (proving the home page's controls were unmounted on navigation, not left stacked alongside page 2's), the new block reaches `data-ugoku-mounted="true"`, and clicking its Run button produces the expected output.

## Workspace/tooling changes

- `pnpm-workspace.yaml` gains two permanent entries: `docs` and `e2e` (alongside the existing `packages/*`).
- Root `package.json` gains two convenience scripts: `"test:e2e": "pnpm --filter ugoku-e2e test"` and `"dev:docs": "pnpm --filter ugoku-docs dev"` — thin delegations, no new logic.
- Root `vitest.config.ts` is untouched: `docs/` and `e2e/` contain no `.test.ts` files (the e2e spec is a Playwright test file, a different test runner, not picked up by either existing Vitest project's `include` glob).
