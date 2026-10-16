# Shiki Transformer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@ugoku/shiki`, a build-time Shiki transformer that stamps `data-ugoku-*` attributes on `<pre>` elements for `run`/`run edit` code fences, implementing the contract the already-shipped `@ugoku/core` `mount()`/`unmount()` runtime reads.

**Architecture:** A new workspace package, `packages/shiki`, with three small modules (mode detection, source hashing, the transformer itself) composed into one exported function `ugokuTransformer()`. Pure Node code, no DOM — tests run in a new Vitest "node" project added alongside the existing browser project, since this repo's current `vitest.config.ts` runs everything in Chromium by default and `node:crypto` is unavailable there.

**Tech Stack:** TypeScript, Vitest (Node environment project, not browser), `shiki` v4 (peer + dev dependency), Node's built-in `crypto`.

## Global Constraints

- `data-ugoku-mode` is the only attribute the existing runtime reads today — its value must be exactly `"run"` or `"run-edit"` (see `docs/superpowers/specs/2026-10-15-mount-run-button-design.md`).
- Mode detection tokenizes the fence's raw meta string on whitespace and checks for the literal tokens `run`, `edit`, `twoslash` — order- and position-independent, coexisting with any other meta tokens (`{1,3}`, `:line-numbers`, `[file.ts]`, etc.).
- `run edit` + `twoslash` together silently downgrades to `run` (CLAUDE.md: "Twoslash + `run edit`: unsupported. Twoslash + `run` is fine.").
- Blocks with no `run` token are left **completely untouched** — the transformer's hook must no-op immediately, not set any attribute (not even empty), so output is provably byte-identical with or without this transformer registered.
- Attributes stamped (mode `run`/`run-edit` only): `data-ugoku-mode`, `data-ugoku-lang` (from Shiki's resolved `lang`), theme attribute(s) (`data-ugoku-theme` for single-theme configs, `data-ugoku-theme-light`/`data-ugoku-theme-dark` for dual-theme configs), `data-ugoku-hash` (first 10 hex characters of the SHA-256 digest of the block's original source text, via Node's `crypto`).
- Framework-agnostic: no VitePress-specific code in this package. VitePress wiring is separate, future work.
- `@ugoku/shiki` depends on `shiki` as both a **peer dependency** (what consumers provide) and a **dev dependency** (what its own tests run against).
- Minimal comments — only where something is genuinely non-obvious (e.g. why `theme`/`themes` needs a type cast).

---

### Task 1: Package scaffold, Node test project, and mode detection

**Files:**
- Create: `packages/shiki/package.json`
- Modify: `vitest.config.ts` (root)
- Modify: `tsconfig.json` (root)
- Create: `packages/shiki/src/mode.ts`
- Test: `packages/shiki/src/mode.test.ts`

**Interfaces:**
- Produces: `resolveMode(rawMeta: string | undefined): 'run' | 'run-edit' | null` — later tasks (the transformer) call this with `this.options.meta?.__raw` from Shiki's transformer context.

**Context:** This repo's root `vitest.config.ts` currently runs *every* test in a real Chromium browser (via `@vitest/browser-playwright`) — confirmed by inspecting the file; there's no existing Node-environment test setup. This package is pure build-time Node code (it will use `node:crypto` in Task 2) and cannot run under that browser project — Vite externalizes `node:crypto` for browser builds, so importing it there throws `Module "node:crypto" has been externalized for browser compatibility`. Vitest 5's `test.projects` config (confirmed present in this repo's installed `vitest@5.0.5`) lets one config file define multiple independent test environments. This task restructures `vitest.config.ts` into two projects: the existing browser project (scoped to `packages/core`) and a new node project (scoped to `packages/shiki`).

Separately, this repo's root `tsconfig.json` does **not** currently resolve Node's ambient types automatically under its installed TypeScript version (`typescript@7.0.2`) — `import { createHash } from 'node:crypto'` fails `tsc --noEmit` with `Cannot find name 'node:crypto'` unless `@types/node` is both installed and explicitly listed in `compilerOptions.types`. This was confirmed by reproducing the failure and fixing it with the exact change in Step 2 below.

- [ ] **Step 1: Create the package manifest**

Create `packages/shiki/package.json`:

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

- [ ] **Step 2: Add `@types/node` and fix `tsconfig.json`**

```bash
pnpm add -D -w @types/node
```

Then edit root `tsconfig.json` to add `"types": ["node"]` under `compilerOptions`. Full resulting file:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "WebWorker"],
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["packages/*/src"]
}
```

- [ ] **Step 3: Split `vitest.config.ts` into a browser project and a node project**

Replace the full contents of root `vitest.config.ts`:

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

- [ ] **Step 4: Install dependencies**

```bash
pnpm install
```

Expected: pnpm links `@ugoku/shiki` into the workspace and installs `shiki` into its `node_modules`. No errors.

- [ ] **Step 5: Write the failing test**

Create `packages/shiki/src/mode.test.ts`:

```ts
import { expect, test } from 'vitest';
import { resolveMode } from './mode';

test('returns null when run is absent', () => {
  expect(resolveMode(undefined)).toBeNull();
  expect(resolveMode('')).toBeNull();
  expect(resolveMode('{1,3}')).toBeNull();
});

test('returns run when run is present without edit', () => {
  expect(resolveMode('run')).toBe('run');
  expect(resolveMode('run {1,3}')).toBe('run');
});

test('returns run-edit when both run and edit are present', () => {
  expect(resolveMode('run edit')).toBe('run-edit');
  expect(resolveMode('edit run')).toBe('run-edit');
});

test('tokens coexist with other meta flags regardless of position', () => {
  expect(resolveMode('{1,3} run :line-numbers edit [file.ts]')).toBe('run-edit');
});

test('downgrades to run when twoslash is also present', () => {
  expect(resolveMode('run edit twoslash')).toBe('run');
  expect(resolveMode('twoslash run edit')).toBe('run');
});

test('does not match run as a substring of another token', () => {
  expect(resolveMode('run-something')).toBeNull();
  expect(resolveMode('rerun')).toBeNull();
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `pnpm test -- --project node`
Expected: FAIL — `packages/shiki/src/mode.ts` does not exist, so the import errors.

- [ ] **Step 7: Implement `resolveMode`**

Create `packages/shiki/src/mode.ts`:

```ts
export type UgokuMode = 'run' | 'run-edit';

export function resolveMode(rawMeta: string | undefined): UgokuMode | null {
  const tokens = new Set((rawMeta ?? '').split(/\s+/).filter(Boolean));
  if (!tokens.has('run')) return null;
  if (tokens.has('edit') && !tokens.has('twoslash')) return 'run-edit';
  return 'run';
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `pnpm test -- --project node`
Expected: PASS, 6 tests.

- [ ] **Step 9: Run the full suite and typecheck to confirm no regressions**

Run: `pnpm test`
Expected: PASS, 8 test files, 52 tests (46 pre-existing + 6 new).

Run: `pnpm typecheck`
Expected: PASS, no errors.

- [ ] **Step 10: Commit**

```bash
git add packages/shiki/package.json packages/shiki/src/mode.ts packages/shiki/src/mode.test.ts vitest.config.ts tsconfig.json package.json pnpm-lock.yaml
git commit -m "feat: scaffold @ugoku/shiki with mode detection"
```

---

### Task 2: Source hashing

**Files:**
- Create: `packages/shiki/src/hash.ts`
- Test: `packages/shiki/src/hash.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `hashSource(source: string): string` — returns a 10-character lowercase hex string. The transformer (Task 3) calls this with the block's original source text.

- [ ] **Step 1: Write the failing test**

Create `packages/shiki/src/hash.test.ts`:

```ts
import { expect, test } from 'vitest';
import { hashSource } from './hash';

test('produces a 10-character lowercase hex string', () => {
  expect(hashSource('console.log(1)')).toMatch(/^[0-9a-f]{10}$/);
});

test('is deterministic for the same source', () => {
  expect(hashSource('const x = 1;')).toBe(hashSource('const x = 1;'));
});

test('changes when the source changes', () => {
  expect(hashSource('const x = 1;')).not.toBe(hashSource('const x = 2;'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- --project node`
Expected: FAIL — `packages/shiki/src/hash.ts` does not exist.

- [ ] **Step 3: Implement `hashSource`**

Create `packages/shiki/src/hash.ts`:

```ts
import { createHash } from 'node:crypto';

const HASH_LENGTH = 10;

export function hashSource(source: string): string {
  return createHash('sha256').update(source).digest('hex').slice(0, HASH_LENGTH);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- --project node`
Expected: PASS, 9 tests (6 from Task 1 + 3 new).

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm test`
Expected: PASS, 9 test files, 55 tests.

Run: `pnpm typecheck`
Expected: PASS, no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shiki/src/hash.ts packages/shiki/src/hash.test.ts
git commit -m "feat: add source hashing to @ugoku/shiki"
```

---

### Task 3: The transformer

**Files:**
- Create: `packages/shiki/src/transformer.ts`
- Create: `packages/shiki/src/index.ts`
- Test: `packages/shiki/src/transformer.test.ts`

**Interfaces:**
- Consumes: `resolveMode(rawMeta: string | undefined): 'run' | 'run-edit' | null` from `./mode` (Task 1); `hashSource(source: string): string` from `./hash` (Task 2); the `ShikiTransformer` type from the `shiki` package.
- Produces: `ugokuTransformer(): ShikiTransformer` — the package's sole public export, re-exported from `src/index.ts`. Consumers register it: `codeToHtml(code, { ..., transformers: [ugokuTransformer()] })` or in VitePress's `markdown.codeTransformers` array (future work, not this task).

**Context on the Shiki transformer API** (verified directly against `shiki@4.5.0`'s shipped type declarations and runtime behavior — do not need to re-derive this):

- A transformer is a plain object with named hooks. This task only needs the `pre(hast)` hook, called once per code block with the generated `<pre>` hast `Element` before serialization.
- Inside `pre`, `this.source` is the block's original, untokenized source text (exact string that was fenced) — use this for hashing, not anything derived from `hast`.
- `this.options.meta?.__raw` is the fence's raw meta string (everything after the language on the opening fence line, e.g. for `` ```ts run edit {1,3} `` it is `"run edit {1,3}"`). It is `undefined` if the integration didn't pass a `meta` option at all.
- `this.options.lang` is the resolved language string (e.g. `"js"`, `"ts"`).
- Single-theme configs expose `this.options.theme: string` (plus, in principle, a full theme-registration object — not just a string — hence the cast in Step 3 below). Dual-theme configs expose `this.options.themes: { light?: string; dark?: string; [key: string]: string | undefined }` instead; the two are mutually exclusive, which is why the code below uses `'theme' in this.options` / `'themes' in this.options` to narrow between them (destructuring both directly off `this.options` does not typecheck, since they come from a discriminated union).
- Setting `hast.properties['data-foo'] = 'bar'` is sufficient to add a plain HTML attribute to the generated `<pre>` tag — no helper needed, and hast's `Properties` type has a string index signature that accepts this directly for `string` values.
- A `pre` hook that returns nothing (`undefined`) leaves the node completely unmodified for every other purpose — this is how "untouched when no `run` token" is implemented: return immediately before touching `hast` at all.

- [ ] **Step 1: Write the failing test**

Create `packages/shiki/src/transformer.test.ts`:

```ts
import { expect, test } from 'vitest';
import { codeToHtml } from 'shiki';
import type { ShikiTransformer } from 'shiki';
import { ugokuTransformer } from './transformer';

const theme = 'github-light';

test('plain fence without run is left byte-identical', async () => {
  const options = { lang: 'js' as const, theme, meta: { __raw: '{1,3}' } };
  const withTransformer = await codeToHtml('const x = 1;', { ...options, transformers: [ugokuTransformer()] });
  const withoutTransformer = await codeToHtml('const x = 1;', options);
  expect(withTransformer).toBe(withoutTransformer);
});

test('run stamps data-ugoku-mode, lang, theme, and hash', async () => {
  const html = await codeToHtml('const x = 1;', {
    lang: 'js',
    theme,
    meta: { __raw: 'run' },
    transformers: [ugokuTransformer()],
  });
  expect(html).toContain('data-ugoku-mode="run"');
  expect(html).toContain('data-ugoku-lang="js"');
  expect(html).toContain('data-ugoku-theme="github-light"');
  expect(html).toMatch(/data-ugoku-hash="[0-9a-f]{10}"/);
});

test('run edit stamps run-edit', async () => {
  const html = await codeToHtml('const x = 1;', {
    lang: 'ts',
    theme,
    meta: { __raw: 'run edit' },
    transformers: [ugokuTransformer()],
  });
  expect(html).toContain('data-ugoku-mode="run-edit"');
});

test('run and edit coexist with other meta tokens regardless of order', async () => {
  const html = await codeToHtml('const x = 1;', {
    lang: 'ts',
    theme,
    meta: { __raw: '{1,3} run :line-numbers edit [file.ts]' },
    transformers: [ugokuTransformer()],
  });
  expect(html).toContain('data-ugoku-mode="run-edit"');
});

test('does not interfere with another transformer reading its own meta token', async () => {
  const stub: ShikiTransformer = {
    name: 'stub',
    pre(hast) {
      if (this.options.meta?.__raw?.includes(':line-numbers')) {
        hast.properties['data-stub-line-numbers'] = 'true';
      }
    },
  };
  const html = await codeToHtml('const x = 1;', {
    lang: 'ts',
    theme,
    meta: { __raw: 'run :line-numbers' },
    transformers: [ugokuTransformer(), stub],
  });
  expect(html).toContain('data-ugoku-mode="run"');
  expect(html).toContain('data-stub-line-numbers="true"');
});

test('run edit downgrades to run when twoslash is present', async () => {
  const html = await codeToHtml('const x = 1;', {
    lang: 'ts',
    theme,
    meta: { __raw: 'run edit twoslash' },
    transformers: [ugokuTransformer()],
  });
  expect(html).toContain('data-ugoku-mode="run"');
  expect(html).not.toContain('data-ugoku-mode="run-edit"');
});

test('dual-theme config stamps light and dark theme attributes', async () => {
  const html = await codeToHtml('const x = 1;', {
    lang: 'js',
    themes: { light: 'github-light', dark: 'github-dark' },
    meta: { __raw: 'run' },
    transformers: [ugokuTransformer()],
  });
  expect(html).toContain('data-ugoku-theme-light="github-light"');
  expect(html).toContain('data-ugoku-theme-dark="github-dark"');
  expect(html).not.toContain('data-ugoku-theme=');
});

test('single-theme config stamps one theme attribute', async () => {
  const html = await codeToHtml('const x = 1;', {
    lang: 'js',
    theme,
    meta: { __raw: 'run' },
    transformers: [ugokuTransformer()],
  });
  expect(html).toContain('data-ugoku-theme="github-light"');
  expect(html).not.toContain('data-ugoku-theme-light=');
});

test('hash is deterministic for identical source and differs when source changes', async () => {
  const makeHtml = (code: string) =>
    codeToHtml(code, { lang: 'js', theme, meta: { __raw: 'run' }, transformers: [ugokuTransformer()] });

  const first = await makeHtml('const x = 1;');
  const same = await makeHtml('const x = 1;');
  const different = await makeHtml('const x = 2;');

  const extractHash = (html: string) => html.match(/data-ugoku-hash="([0-9a-f]{10})"/)?.[1];

  expect(extractHash(first)).toBe(extractHash(same));
  expect(extractHash(first)).not.toBe(extractHash(different));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- --project node`
Expected: FAIL — `packages/shiki/src/transformer.ts` does not exist.

- [ ] **Step 3: Implement the transformer**

Create `packages/shiki/src/transformer.ts`:

```ts
import type { ShikiTransformer } from 'shiki';
import { resolveMode } from './mode';
import { hashSource } from './hash';

export function ugokuTransformer(): ShikiTransformer {
  return {
    name: 'ugoku',
    pre(hast) {
      const mode = resolveMode(this.options.meta?.__raw);
      if (!mode) return;

      hast.properties['data-ugoku-mode'] = mode;
      hast.properties['data-ugoku-lang'] = this.options.lang;
      hast.properties['data-ugoku-hash'] = hashSource(this.source);

      // theme/themes can technically hold a full registration object, not just
      // a name — but every real config (VitePress included) references themes
      // by their string name.
      if ('theme' in this.options && this.options.theme) {
        hast.properties['data-ugoku-theme'] = this.options.theme as string;
      } else if ('themes' in this.options && this.options.themes) {
        const { light, dark } = this.options.themes as Record<string, string>;
        if (light) hast.properties['data-ugoku-theme-light'] = light;
        if (dark) hast.properties['data-ugoku-theme-dark'] = dark;
      }
    },
  };
}
```

Create `packages/shiki/src/index.ts`:

```ts
export { ugokuTransformer } from './transformer';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test -- --project node`
Expected: PASS, 18 tests (9 from Tasks 1-2 + 9 new).

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm test`
Expected: PASS, 10 test files, 64 tests (46 pre-existing in `packages/core` + 18 in `packages/shiki`).

Run: `pnpm typecheck`
Expected: PASS, no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shiki/src/transformer.ts packages/shiki/src/transformer.test.ts packages/shiki/src/index.ts
git commit -m "feat: add ugokuTransformer stamping data-ugoku-* attributes"
```
