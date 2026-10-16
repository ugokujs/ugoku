# `run edit` (v0.2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `run edit` blocks actually editable: a transparent textarea overlay over the highlighted `<pre>`, lazy Shiki re-highlighting on first interaction, localStorage persistence keyed by source hash with a Reset button, and a self-hostable standalone chunk for no-bundler sites.

**Architecture:** `mount.ts` gains a `run-edit`-only code path that creates a textarea overlay (always present, zero Shiki cost) and wires persistence/focus/input/reset. The actual Shiki re-highlighting logic lives in `src/edit/editor.ts`, a separate module loaded only via dynamic `import()` on first focus (or immediately, for a block with a previously-saved edit). A second, fully self-contained build (`dist/edit-standalone.js`, built with esbuild) bundles a fixed JS/TS + github-light/dark preset for sites with no bundler at all.

**Tech Stack:** TypeScript, `shiki` (`shiki/core` + `shiki/engine/javascript`, using shiki's own built-in `bundledLanguages`/`bundledThemes` maps — confirmed via a live spike to survive real Vite/Rollup bundling with correct per-item code-splitting), Vitest browser-mode (real Chromium, same project `@ugoku/core`'s existing tests already run under), esbuild (new, for the standalone chunk only), Playwright (existing `e2e/` suite, extended).

## Global Constraints

- All new non-test `.ts` files under `packages/core/src/edit/` use explicit `.ts` extensions on relative imports (e.g. `from './persistence.ts'`) — required for VitePress's Node-native config-loading resolver, per this repo's existing convention (see `packages/core/src/mount/mount.ts`, `packages/core/src/index.ts`). Test files (`*.test.ts`) do not need this — they're only ever loaded by Vitest's bundler resolution.
- All new `packages/core/src/edit/*.test.ts` files run automatically under the existing `browser` Vitest project (`vitest.config.ts`'s `include: ['packages/core/**/*.test.ts']` already covers any new file here — no config change needed).
- **Dynamic imports built from a runtime template-literal variable (e.g. `` import(`shiki/langs/${lang}.mjs`) ``) do not survive a real Vite/Rollup production build** — confirmed via a live spike against a real `vitepress build` + `vitepress preview` + headless Chromium: the bare specifier is left completely unresolved in the output and fails at runtime with `Failed to resolve module specifier`. Never write a dynamic import with an interpolated path. Always use a literal string, or a pre-existing static map whose own source contains literal per-entry `import()` calls.
- **`shiki` (v4.5.0, matching `@ugoku/shiki`'s devDependency version) already ships exactly this static map**, for both languages and themes: `bundledLanguages` from `shiki/langs` and `bundledThemes` from `shiki/themes`, each a `Record<name, () => Promise<Module>>` with literal per-entry `import()` calls baked into shiki's own compiled source. Confirmed via a live spike: importing and calling these produces 309 individually code-split chunks (one per lang/theme, ~28KB each) that resolve correctly at runtime. Use these directly — do not write a custom codegen script for the bundler path.
- `HighlighterCore` (from `shiki/core`) exposes `getLoadedLanguages(): string[]` and `getLoadedThemes(): string[]` — use these to avoid redundant `loadLanguage`/`loadTheme` calls for a lang/theme already loaded by an earlier block on the same page.
- `highlighter.codeToHtml(code, { lang, theme })` (single theme) or `highlighter.codeToHtml(code, { lang, themes: { light, dark } })` (dual theme) returns a full HTML string `<pre class="shiki ..." style="..."><code>...</code></pre>` — confirmed via a live spike. Dual-theme output embeds `--shiki-dark` CSS custom properties per span plus `--shiki-dark-bg`/`background-color` on the `<pre>`'s own `style` attribute. Re-highlighting a block must replace the `<pre>`'s own `class` and `style` attributes from this fresh output (not just the inner `<code>`), while preserving every `data-ugoku-*` attribute (those are separate attribute names, unaffected by a `class`/`style` replacement).
- `pre[data-ugoku-mode="run-edit"] { position: relative }` must be set via a CSS rule, **not** inline `pre.style.position = 'relative'` — the re-highlight step replaces the `<pre>`'s entire `style` attribute from Shiki's fresh output, which would silently wipe out an inline `position: relative` set by our own code. A CSS class/attribute selector rule is unaffected by that replacement.
- The `.ugoku-edit-overlay` textarea must use `font: inherit; line-height: inherit; white-space: pre;` rather than copying computed styles via JS — `<pre>`/`<code>` already set the real font/line-height via CSS, and these are inherited properties, so a plain child element gets them for free. Do not add a `getComputedStyle` copying step; it would be redundant and a maintenance burden.
- `unmount()` must remove the `.ugoku-edit-overlay` element (a *child* of `<pre>`, unlike `.ugoku-controls`/`.ugoku-output-panel` which are *siblings*) before clearing `data-ugoku-mounted`. Without this, an `unmount()` → `mount()` cycle on the same `<pre>` (exercised directly by tests, and a real possibility for any future adapter that doesn't fully replace the DOM subtree on navigation) would append a second overlay textarea on re-mount.
- Persistence key format: `` `ugoku:edit:${hash}` `` in `localStorage`, where `hash` is the block's `data-ugoku-hash` value (already stamped by `@ugoku/shiki`'s transformer). All `localStorage` access is wrapped in try/catch — a throw (private browsing, quota, disabled storage) must degrade to in-memory-only editing for that page view, never crash or surface an error to the reader.
- Debounce for save + re-highlight on input: 400ms after the reader stops typing.
- Reset button (`.ugoku-reset-btn`) is always present in `.ugoku-controls` for `run-edit` blocks (not conditionally shown), alongside the existing Run/Stop buttons.
- Run must execute the textarea's *current* value once the reader has made any edit (including a restored saved edit) — not the original build-time source. Before any edit, Run still uses the original source, even though the textarea sits on top of it.
- `@ugoku/core`'s `package.json` gains a new `"./edit"` exports subpath pointing at `src/edit/editor.ts`, as a documented, stable public entry point — kept even though `mount.ts` itself uses a plain relative dynamic import (`import('../edit/editor.ts')`) for its own call site. Both resolve to the same file; the subpath exists for any future adapter or power user that wants to call `highlightInto` directly without reaching into internals.
- The no-bundler standalone chunk (`dist/edit-standalone.js`) is a **separate, independent deliverable** from the bundler path — it does not share `editor.ts`'s full-coverage lazy loading (no bundler to code-split for), and is not wired into `mount.ts` at all. It bundles a **fixed preset** (`javascript`, `typescript` langs; `github-light`, `github-dark` themes) directly via esbuild, confirmed via a live spike to produce a working, self-contained ~530KB minified (~88KB gzipped) ESM file with zero remaining bare imports. A block whose lang/theme isn't in this fixed preset gets a working plain-text-editable textarea with no re-highlighting — a documented limitation, not a bug. Solving "how does a no-bundler site use ugoku at all" (the base `mount`/`run` functionality) is out of scope for this plan — VitePress (the only current adapter) is bundler-based, and this plan only ships the isolated highlighting asset for whenever that broader story is built.
- Minimal comments — only where something is genuinely non-obvious (several are already called out explicitly in the steps below; don't add more than those).

---

### Task 1: Persistence

**Files:**
- Create: `packages/core/src/edit/persistence.ts`
- Test: `packages/core/src/edit/persistence.test.ts`

**Interfaces:**
- Produces: `loadSavedEdit(hash: string): string | null`, `saveEdit(hash: string, value: string): void`, `clearSavedEdit(hash: string): void`. Later tasks (Task 4) import all three directly from this file.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/edit/persistence.test.ts
import { expect, test, vi } from 'vitest';
import { loadSavedEdit, saveEdit, clearSavedEdit } from './persistence';

test('saveEdit then loadSavedEdit round-trips a value', () => {
  saveEdit('hash-a', 'let x = 1;');
  expect(loadSavedEdit('hash-a')).toBe('let x = 1;');
  clearSavedEdit('hash-a');
});

test('loadSavedEdit returns null when nothing is saved', () => {
  expect(loadSavedEdit('never-saved-hash')).toBeNull();
});

test('clearSavedEdit removes the saved value', () => {
  saveEdit('hash-b', 'console.log(1)');
  clearSavedEdit('hash-b');
  expect(loadSavedEdit('hash-b')).toBeNull();
});

test('different hashes do not collide', () => {
  saveEdit('hash-c', 'one');
  saveEdit('hash-d', 'two');
  expect(loadSavedEdit('hash-c')).toBe('one');
  expect(loadSavedEdit('hash-d')).toBe('two');
  clearSavedEdit('hash-c');
  clearSavedEdit('hash-d');
});

test('saveEdit does not throw when localStorage.setItem throws', () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota exceeded');
  });
  expect(() => saveEdit('hash-e', 'x')).not.toThrow();
  spy.mockRestore();
});

test('loadSavedEdit returns null when localStorage.getItem throws', () => {
  const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('disabled');
  });
  expect(loadSavedEdit('hash-f')).toBeNull();
  spy.mockRestore();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run packages/core/src/edit/persistence.test.ts`
Expected: FAIL — `Cannot find module './persistence'`

- [ ] **Step 3: Implement**

```ts
// packages/core/src/edit/persistence.ts
const PREFIX = 'ugoku:edit:';

export function loadSavedEdit(hash: string): string | null {
  try {
    return localStorage.getItem(PREFIX + hash);
  } catch {
    return null;
  }
}

export function saveEdit(hash: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + hash, value);
  } catch {
    // Private browsing, quota exceeded, or storage disabled — degrade to
    // in-memory-only editing for this page view.
  }
}

export function clearSavedEdit(hash: string): void {
  try {
    localStorage.removeItem(PREFIX + hash);
  } catch {
    // See saveEdit.
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run packages/core/src/edit/persistence.test.ts`
Expected: PASS — 6 tests

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/edit/persistence.ts packages/core/src/edit/persistence.test.ts
git commit -m "feat: add localStorage persistence for edited blocks"
```

---

### Task 2: Overlay and splice helpers

**Files:**
- Create: `packages/core/src/edit/overlay.ts`
- Test: `packages/core/src/edit/overlay.browser.test.ts`
- Create: `packages/core/src/edit/splice.ts`
- Test: `packages/core/src/edit/splice.browser.test.ts`
- Modify: `packages/core/src/output-panel/styles.css`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `createOverlay(pre: HTMLElement): HTMLTextAreaElement` (appends a positioned textarea as a child of `pre`, returns it). `spliceHighlightedHtml(pre: HTMLElement, freshHtml: string): void` (parses `freshHtml` — a full `<pre>...</pre>` string from Shiki's `codeToHtml` — and applies its `class`/`style`/inner-`<code>`-HTML onto `pre`, preserving `pre`'s other attributes; a no-op if `freshHtml` doesn't parse into a `<pre><code>` structure). Task 3 (`editor.ts`) and Task 5 (`standalone-entry.ts`) both call `spliceHighlightedHtml`. Task 4 (`mount.ts`) calls `createOverlay`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/edit/overlay.browser.test.ts
import { expect, test } from 'vitest';
import { createOverlay } from './overlay';

function createPre(): HTMLElement {
  const pre = document.createElement('pre');
  const code = document.createElement('code');
  code.textContent = 'let x = 1;';
  pre.appendChild(code);
  document.body.appendChild(pre);
  return pre;
}

test('createOverlay appends a textarea with the overlay class as a child of pre', () => {
  const pre = createPre();
  const overlay = createOverlay(pre);

  expect(overlay.tagName).toBe('TEXTAREA');
  expect(overlay.className).toBe('ugoku-edit-overlay');
  expect(overlay.parentElement).toBe(pre);

  pre.remove();
});

test('createOverlay disables spellcheck and native autocomplete', () => {
  const pre = createPre();
  const overlay = createOverlay(pre);

  expect(overlay.spellcheck).toBe(false);
  expect(overlay.getAttribute('autocomplete')).toBe('off');

  pre.remove();
});
```

```ts
// packages/core/src/edit/splice.browser.test.ts
import { expect, test } from 'vitest';
import { spliceHighlightedHtml } from './splice';

function createPre(): HTMLElement {
  const pre = document.createElement('pre');
  pre.className = 'shiki original-theme';
  pre.setAttribute('style', 'background-color:#fff');
  pre.dataset.ugokuMode = 'run-edit';
  const code = document.createElement('code');
  code.innerHTML = '<span class="line">original</span>';
  pre.appendChild(code);
  document.body.appendChild(pre);
  return pre;
}

test('spliceHighlightedHtml replaces class, style, and code innerHTML from the fresh markup', () => {
  const pre = createPre();
  const freshHtml =
    '<pre class="shiki new-theme" style="background-color:#000"><code><span class="line">updated</span></code></pre>';

  spliceHighlightedHtml(pre, freshHtml);

  expect(pre.className).toBe('shiki new-theme');
  expect(pre.getAttribute('style')).toBe('background-color:#000');
  expect(pre.querySelector('code')?.innerHTML).toBe('<span class="line">updated</span>');

  pre.remove();
});

test('spliceHighlightedHtml preserves data-ugoku-* attributes', () => {
  const pre = createPre();
  const freshHtml = '<pre class="shiki new-theme"><code><span class="line">updated</span></code></pre>';

  spliceHighlightedHtml(pre, freshHtml);

  expect(pre.dataset.ugokuMode).toBe('run-edit');

  pre.remove();
});

test('spliceHighlightedHtml removes the style attribute when the fresh markup has none', () => {
  const pre = createPre();
  const freshHtml = '<pre class="shiki new-theme"><code><span class="line">updated</span></code></pre>';

  spliceHighlightedHtml(pre, freshHtml);

  expect(pre.hasAttribute('style')).toBe(false);

  pre.remove();
});

test('spliceHighlightedHtml is a no-op when the fresh markup has no code element', () => {
  const pre = createPre();
  const originalInnerHTML = pre.querySelector('code')!.innerHTML;

  spliceHighlightedHtml(pre, '<div>not a pre/code structure</div>');

  expect(pre.querySelector('code')?.innerHTML).toBe(originalInnerHTML);

  pre.remove();
});
```

- [ ] **Step 2: Run to verify both fail**

Run: `npx vitest run packages/core/src/edit/overlay.browser.test.ts packages/core/src/edit/splice.browser.test.ts`
Expected: FAIL — `Cannot find module './overlay'` / `Cannot find module './splice'`

- [ ] **Step 3: Implement `overlay.ts`**

```ts
// packages/core/src/edit/overlay.ts
export function createOverlay(pre: HTMLElement): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.className = 'ugoku-edit-overlay';
  textarea.spellcheck = false;
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('autocapitalize', 'off');
  pre.appendChild(textarea);
  return textarea;
}
```

- [ ] **Step 4: Implement `splice.ts`**

```ts
// packages/core/src/edit/splice.ts
export function spliceHighlightedHtml(pre: HTMLElement, freshHtml: string): void {
  const container = document.createElement('div');
  container.innerHTML = freshHtml;
  const freshPre = container.firstElementChild as HTMLElement | null;
  const freshCode = freshPre?.querySelector('code');
  const codeEl = pre.querySelector('code');
  if (!freshPre || !freshCode || !codeEl) return;

  pre.className = freshPre.className;
  const style = freshPre.getAttribute('style');
  if (style) {
    pre.setAttribute('style', style);
  } else {
    pre.removeAttribute('style');
  }

  codeEl.innerHTML = freshCode.innerHTML;
}
```

- [ ] **Step 5: Add overlay CSS**

Append to `packages/core/src/output-panel/styles.css`:

```css
pre[data-ugoku-mode='run-edit'] {
  position: relative;
}

.ugoku-edit-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: transparent;
  caret-color: var(--ugoku-color-caret, #6a737d);
  font: inherit;
  line-height: inherit;
  white-space: pre;
  overflow: auto;
}
```

- [ ] **Step 6: Run to verify both pass**

Run: `npx vitest run packages/core/src/edit/overlay.browser.test.ts packages/core/src/edit/splice.browser.test.ts`
Expected: PASS — 2 + 4 tests

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/edit/overlay.ts packages/core/src/edit/overlay.browser.test.ts packages/core/src/edit/splice.ts packages/core/src/edit/splice.browser.test.ts packages/core/src/output-panel/styles.css
git commit -m "feat: add edit overlay and highlight-splice helpers"
```

---

### Task 3: Shared highlighter cache and the lazy `editor.ts` module

**Files:**
- Modify: `packages/core/package.json`
- Create: `packages/core/src/edit/highlighter-cache.ts`
- Test: `packages/core/src/edit/highlighter-cache.test.ts`
- Create: `packages/core/src/edit/editor.ts`
- Test: `packages/core/src/edit/editor.browser.test.ts`

**Interfaces:**
- Consumes: `spliceHighlightedHtml` from `./splice.ts` (Task 2).
- Produces: `ensureLoaded(lang: string, themeNames: string[]): Promise<HighlighterCore>` (internal to this task's own module, not consumed elsewhere). `highlightInto(pre: HTMLElement, code: string): Promise<void>` — reads `pre.dataset.ugokuLang`/`ugokuTheme`/`ugokuThemeLight`/`ugokuThemeDark` itself; rejects if the lang or any theme isn't one of shiki's bundled names; resolves without doing anything if no theme attribute is present at all. Task 4 (`mount.ts`) dynamically imports this file and calls `highlightInto`.

- [ ] **Step 1: Add `shiki` as a real dependency and the `./edit` exports subpath**

Current `packages/core/package.json`:

```json
{
  "name": "@ugoku/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts"
}
```

New content:

```json
{
  "name": "@ugoku/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./edit": "./src/edit/editor.ts"
  },
  "dependencies": {
    "shiki": "^4.5.0"
  }
}
```

Run: `pnpm install`
Expected: completes with no errors; `shiki` now resolvable from `packages/core`.

- [ ] **Step 2: Write the failing test for `highlighter-cache.ts`**

```ts
// packages/core/src/edit/highlighter-cache.test.ts
import { expect, test } from 'vitest';
import { ensureLoaded } from './highlighter-cache';

test('ensureLoaded loads a supported language and theme and returns a usable highlighter', async () => {
  const highlighter = await ensureLoaded('javascript', ['github-light']);
  const html = highlighter.codeToHtml('let x = 1;', { lang: 'javascript', theme: 'github-light' });
  expect(html).toContain('<pre');
  expect(html).toContain('<code>');
});

test('ensureLoaded is idempotent for a language/theme already loaded', async () => {
  await ensureLoaded('javascript', ['github-light']);
  await expect(ensureLoaded('javascript', ['github-light'])).resolves.toBeDefined();
});

test('ensureLoaded rejects an unsupported language', async () => {
  await expect(ensureLoaded('not-a-real-lang', ['github-light'])).rejects.toThrow();
});

test('ensureLoaded rejects an unsupported theme', async () => {
  await expect(ensureLoaded('javascript', ['not-a-real-theme'])).rejects.toThrow();
});

test('ensureLoaded loads multiple themes for a dual-theme block', async () => {
  const highlighter = await ensureLoaded('typescript', ['github-light', 'github-dark']);
  const html = highlighter.codeToHtml('let x: number = 1;', {
    lang: 'typescript',
    themes: { light: 'github-light', dark: 'github-dark' },
  });
  expect(html).toContain('--shiki-dark');
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run packages/core/src/edit/highlighter-cache.test.ts`
Expected: FAIL — `Cannot find module './highlighter-cache'`

- [ ] **Step 4: Implement `highlighter-cache.ts`**

```ts
// packages/core/src/edit/highlighter-cache.ts
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages } from 'shiki/langs';
import { bundledThemes } from 'shiki/themes';
import type { HighlighterCore } from 'shiki/core';

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

export async function ensureLoaded(lang: string, themeNames: string[]): Promise<HighlighterCore> {
  if (!(lang in bundledLanguages)) {
    throw new Error(`ugoku: unsupported language "${lang}" for live re-highlighting`);
  }

  const highlighter = await getHighlighter();

  if (!highlighter.getLoadedLanguages().includes(lang)) {
    await highlighter.loadLanguage(bundledLanguages[lang as keyof typeof bundledLanguages]());
  }

  for (const theme of themeNames) {
    if (!(theme in bundledThemes)) {
      throw new Error(`ugoku: unsupported theme "${theme}" for live re-highlighting`);
    }
    if (!highlighter.getLoadedThemes().includes(theme)) {
      await highlighter.loadTheme(bundledThemes[theme as keyof typeof bundledThemes]());
    }
  }

  return highlighter;
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run packages/core/src/edit/highlighter-cache.test.ts`
Expected: PASS — 5 tests

- [ ] **Step 6: Write the failing test for `editor.ts`**

```ts
// packages/core/src/edit/editor.browser.test.ts
import { expect, test } from 'vitest';
import { highlightInto } from './editor';

function createPre(opts: { lang: string; theme?: string; themeLight?: string; themeDark?: string }): HTMLElement {
  const pre = document.createElement('pre');
  pre.dataset.ugokuLang = opts.lang;
  if (opts.theme) pre.dataset.ugokuTheme = opts.theme;
  if (opts.themeLight) pre.dataset.ugokuThemeLight = opts.themeLight;
  if (opts.themeDark) pre.dataset.ugokuThemeDark = opts.themeDark;
  const code = document.createElement('code');
  code.textContent = 'placeholder';
  pre.appendChild(code);
  document.body.appendChild(pre);
  return pre;
}

test('highlightInto re-highlights a single-theme block', async () => {
  const pre = createPre({ lang: 'javascript', theme: 'github-light' });

  await highlightInto(pre, 'let x = 1;');

  expect(pre.className).toContain('shiki');
  expect(pre.querySelector('code')?.innerHTML).toContain('span');

  pre.remove();
});

test('highlightInto re-highlights a dual-theme block', async () => {
  const pre = createPre({ lang: 'typescript', themeLight: 'github-light', themeDark: 'github-dark' });

  await highlightInto(pre, 'let x: number = 1;');

  expect(pre.querySelector('code')?.innerHTML).toContain('--shiki-dark');

  pre.remove();
});

test('highlightInto rejects when the lang is unsupported, leaving the pre untouched', async () => {
  const pre = createPre({ lang: 'not-a-real-lang', theme: 'github-light' });
  const before = pre.querySelector('code')!.innerHTML;

  await expect(highlightInto(pre, 'x')).rejects.toThrow();
  expect(pre.querySelector('code')?.innerHTML).toBe(before);

  pre.remove();
});

test('highlightInto is a no-op when no theme attributes are present', async () => {
  const pre = createPre({ lang: 'javascript' });
  await expect(highlightInto(pre, 'let x = 1;')).resolves.toBeUndefined();
  pre.remove();
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `npx vitest run packages/core/src/edit/editor.browser.test.ts`
Expected: FAIL — `Cannot find module './editor'`

- [ ] **Step 8: Implement `editor.ts`**

```ts
// packages/core/src/edit/editor.ts
import { ensureLoaded } from './highlighter-cache.ts';
import { spliceHighlightedHtml } from './splice.ts';

export async function highlightInto(pre: HTMLElement, code: string): Promise<void> {
  const lang = pre.dataset.ugokuLang ?? '';
  const singleTheme = pre.dataset.ugokuTheme;
  const lightTheme = pre.dataset.ugokuThemeLight;
  const darkTheme = pre.dataset.ugokuThemeDark;

  const themeNames = singleTheme ? [singleTheme] : [lightTheme, darkTheme].filter((t): t is string => !!t);
  if (themeNames.length === 0) return;

  const highlighter = await ensureLoaded(lang, themeNames);

  const html = singleTheme
    ? highlighter.codeToHtml(code, { lang, theme: singleTheme })
    : highlighter.codeToHtml(code, { lang, themes: { light: lightTheme!, dark: darkTheme! } });

  spliceHighlightedHtml(pre, html);
}
```

- [ ] **Step 9: Run to verify it passes**

Run: `npx vitest run packages/core/src/edit/editor.browser.test.ts`
Expected: PASS — 4 tests

- [ ] **Step 10: Run the full suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all tests pass (previous 72 + this task's 9 new = 81); typecheck exits 0.

- [ ] **Step 11: Commit**

```bash
git add packages/core/package.json packages/core/src/edit/highlighter-cache.ts packages/core/src/edit/highlighter-cache.test.ts packages/core/src/edit/editor.ts packages/core/src/edit/editor.browser.test.ts pnpm-lock.yaml
git commit -m "feat: add shared highlighter cache and lazy re-highlight entry point"
```

---

### Task 4: Wire editing into `mount.ts`

**Files:**
- Modify: `packages/core/src/mount/mount.ts`
- Modify: `packages/core/src/mount/mount.browser.test.ts`

**Interfaces:**
- Consumes: `createOverlay` (Task 2), `loadSavedEdit`/`saveEdit`/`clearSavedEdit` (Task 1), and dynamically imports `./editor.ts`'s `highlightInto` (Task 3) — via the relative path `'../edit/editor.ts'`, not the `@ugoku/core/edit` package specifier (see Global Constraints).
- Produces: the complete, user-facing `run-edit` behavior. No new files consume this task's output — it's the integration point.

**Context:** This is the task that makes the whole feature actually work end-to-end for the bundler path. Read `packages/core/src/mount/mount.ts` as it exists now before editing — the `run`-only Run/Stop/output-panel wiring in `mountOne` and the sibling-removal logic in `unmountOne` must stay intact; this task only *adds* a `run-edit`-only branch and one line in `unmountOne`.

- [ ] **Step 1: Write the new/updated failing tests**

Replace the existing `'mounts a "run-edit" pre identically to "run"'` test in `packages/core/src/mount/mount.browser.test.ts` with:

```ts
test('mounts a "run-edit" pre with an extra Reset button and an edit overlay', () => {
  const pre = createPre('run-edit', 'console.log(1)');
  pre.dataset.ugokuHash = 'test-hash-1';
  mount(document.body);

  const controls = pre.nextElementSibling as HTMLElement;
  expect(controls.className).toBe('ugoku-controls');
  expect(controls.querySelector('.ugoku-reset-btn')).not.toBeNull();
  expect(pre.querySelector('.ugoku-edit-overlay')).not.toBeNull();

  unmount(document.body);
  pre.remove();
});
```

Append these new tests to the same file (after the existing tests):

```ts
test('Run on a "run-edit" block executes the overlay value, not the original source', async () => {
  const pre = createPre('run-edit', 'console.log("original")');
  pre.dataset.ugokuHash = 'test-hash-2';
  mount(document.body);

  const overlay = pre.querySelector('.ugoku-edit-overlay') as HTMLTextAreaElement;
  overlay.value = 'console.log("edited")';
  overlay.dispatchEvent(new Event('input'));

  const controls = pre.nextElementSibling as HTMLElement;
  const panel = controls.nextElementSibling as HTMLElement;
  const runBtn = controls.querySelector('.ugoku-run-btn') as HTMLButtonElement;

  runBtn.click();
  await vi.waitFor(() => expect(panel.textContent).toContain('edited'));

  unmount(document.body);
  pre.remove();
});

test('Reset on a "run-edit" block restores the original pre markup and clears the overlay', () => {
  const pre = createPre('run-edit', 'console.log("original")');
  pre.className = 'shiki original-theme';
  pre.dataset.ugokuHash = 'test-hash-3';
  mount(document.body);

  const overlay = pre.querySelector('.ugoku-edit-overlay') as HTMLTextAreaElement;
  overlay.value = 'console.log("edited")';
  overlay.dispatchEvent(new Event('input'));

  const controls = pre.nextElementSibling as HTMLElement;
  const resetBtn = controls.querySelector('.ugoku-reset-btn') as HTMLButtonElement;
  resetBtn.click();

  expect(overlay.value).toBe('');
  expect(pre.className).toBe('shiki original-theme');

  unmount(document.body);
  pre.remove();
});

test('a saved edit is restored into the overlay and eagerly re-highlighted on mount', async () => {
  const pre = document.createElement('pre');
  pre.dataset.ugokuMode = 'run-edit';
  pre.dataset.ugokuHash = 'test-hash-4';
  pre.dataset.ugokuLang = 'javascript';
  pre.dataset.ugokuTheme = 'github-light';
  const code = document.createElement('code');
  code.textContent = 'console.log("original")';
  pre.appendChild(code);
  document.body.appendChild(pre);
  localStorage.setItem('ugoku:edit:test-hash-4', 'console.log("restored")');

  mount(document.body);

  const overlay = pre.querySelector('.ugoku-edit-overlay') as HTMLTextAreaElement;
  expect(overlay.value).toBe('console.log("restored")');
  await vi.waitFor(() => expect(pre.className).toContain('shiki'));
  expect(pre.querySelector('code')?.innerHTML).toContain('restored');

  unmount(document.body);
  localStorage.removeItem('ugoku:edit:test-hash-4');
  pre.remove();
});

test('focusing the overlay twice before editing does not break re-highlighting on later input', async () => {
  const pre = document.createElement('pre');
  pre.dataset.ugokuMode = 'run-edit';
  pre.dataset.ugokuHash = 'test-hash-6';
  pre.dataset.ugokuLang = 'javascript';
  pre.dataset.ugokuTheme = 'github-light';
  const code = document.createElement('code');
  code.textContent = 'console.log(1)';
  pre.appendChild(code);
  document.body.appendChild(pre);

  mount(document.body);

  const overlay = pre.querySelector('.ugoku-edit-overlay') as HTMLTextAreaElement;
  overlay.dispatchEvent(new Event('focus'));
  overlay.dispatchEvent(new Event('focus'));

  overlay.value = 'console.log(2)';
  overlay.dispatchEvent(new Event('input'));

  await vi.waitFor(() => expect(pre.querySelector('code')?.innerHTML).toContain('2'));

  unmount(document.body);
  pre.remove();
});

test('unmount followed by mount again does not leave a duplicate overlay', () => {
  const pre = createPre('run-edit', 'console.log(1)');
  pre.dataset.ugokuHash = 'test-hash-5';

  mount(document.body);
  unmount(document.body);
  mount(document.body);

  expect(pre.querySelectorAll('.ugoku-edit-overlay').length).toBe(1);

  unmount(document.body);
  pre.remove();
});
```

- [ ] **Step 2: Run to verify these fail**

Run: `npx vitest run packages/core/src/mount/mount.browser.test.ts`
Expected: FAIL — no Reset button, no overlay, Run uses stale source

- [ ] **Step 3: Implement the `mount.ts` changes**

Full new content for `packages/core/src/mount/mount.ts`:

```ts
import { runCode } from '../runner/run-code.ts';
import type { RunHandle } from '../runner/run-code.ts';
import { OutputPanel } from '../output-panel/output-panel.ts';
import type { ConsoleMessage } from '../runner/protocol.ts';
import { createOverlay } from '../edit/overlay.ts';
import { loadSavedEdit, saveEdit, clearSavedEdit } from '../edit/persistence.ts';

const activeRuns = new WeakMap<HTMLElement, RunHandle>();
const SAVE_DEBOUNCE_MS = 400;

export function mount(root: ParentNode): void {
  const pres = root.querySelectorAll<HTMLElement>('pre[data-ugoku-mode]:not([data-ugoku-mounted])');
  pres.forEach((pre) => mountOne(pre));
}

export function unmount(root: ParentNode): void {
  const pres = root.querySelectorAll<HTMLElement>('pre[data-ugoku-mounted]');
  pres.forEach((pre) => unmountOne(pre));
}

function mountOne(pre: HTMLElement): void {
  const source = pre.textContent ?? '';

  const controls = document.createElement('div');
  controls.className = 'ugoku-controls';

  const runBtn = document.createElement('button');
  runBtn.className = 'ugoku-run-btn';
  runBtn.textContent = 'Run';

  const stopBtn = document.createElement('button');
  stopBtn.className = 'ugoku-stop-btn';
  stopBtn.textContent = 'Stop';
  stopBtn.disabled = true;

  controls.append(runBtn, stopBtn);

  const panel = new OutputPanel();
  panel.element.hidden = true;

  pre.insertAdjacentElement('afterend', controls);
  controls.insertAdjacentElement('afterend', panel.element);

  let getCurrentSource = () => source;
  if (pre.dataset.ugokuMode === 'run-edit') {
    getCurrentSource = setupRunEdit(pre, controls, panel, source);
  }

  function setRunning(running: boolean): void {
    runBtn.disabled = running;
    stopBtn.disabled = !running;
  }

  function finish(): void {
    setRunning(false);
    activeRuns.delete(pre);
  }

  runBtn.addEventListener('click', () => {
    panel.clear();
    panel.element.hidden = true;
    setRunning(true);
    const handle = runCode(getCurrentSource(), {
      onConsole(level, args) {
        panel.element.hidden = false;
        panel.appendConsole({ level: level as ConsoleMessage['level'], args });
      },
      onDone: finish,
      onError(error) {
        panel.element.hidden = false;
        panel.appendError(error);
        finish();
      },
      onTimeout: finish,
      onStopped: finish,
    });
    activeRuns.set(pre, handle);
  });

  stopBtn.addEventListener('click', () => {
    activeRuns.get(pre)?.stop();
  });

  pre.dataset.ugokuMounted = 'true';
}

function setupRunEdit(
  pre: HTMLElement,
  controls: HTMLElement,
  panel: OutputPanel,
  source: string,
): () => string {
  const hash = pre.dataset.ugokuHash ?? '';
  const originalClassName = pre.className;
  const originalStyle = pre.getAttribute('style');
  const codeEl = pre.querySelector('code');
  const originalCodeHTML = codeEl?.innerHTML ?? '';

  const overlay = createOverlay(pre);
  let hasBeenEdited = false;
  let editChunkPromise: Promise<typeof import('../edit/editor.ts')> | null = null;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  function loadEditChunk() {
    if (!editChunkPromise) {
      editChunkPromise = import('../edit/editor.ts');
    }
    return editChunkPromise;
  }

  async function rehighlight(code: string): Promise<void> {
    try {
      const mod = await loadEditChunk();
      await mod.highlightInto(pre, code);
    } catch {
      panel.element.hidden = false;
      panel.appendConsole({
        level: 'warn',
        args: [
          {
            kind: 'primitive',
            value: 'ugoku: live syntax highlighting unavailable for this block — editing still works.',
          },
        ],
      });
    }
  }

  const saved = loadSavedEdit(hash);
  if (saved !== null) {
    overlay.value = saved;
    hasBeenEdited = true;
    void rehighlight(saved);
  }

  overlay.addEventListener('focus', () => {
    void loadEditChunk();
  });

  overlay.addEventListener('input', () => {
    hasBeenEdited = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveEdit(hash, overlay.value);
      void rehighlight(overlay.value);
    }, SAVE_DEBOUNCE_MS);
  });

  const resetBtn = document.createElement('button');
  resetBtn.className = 'ugoku-reset-btn';
  resetBtn.textContent = 'Reset';
  resetBtn.addEventListener('click', () => {
    clearTimeout(saveTimer);
    clearSavedEdit(hash);
    overlay.value = '';
    hasBeenEdited = false;
    pre.className = originalClassName;
    if (originalStyle) {
      pre.setAttribute('style', originalStyle);
    } else {
      pre.removeAttribute('style');
    }
    if (codeEl) codeEl.innerHTML = originalCodeHTML;
  });
  controls.append(resetBtn);

  return () => (hasBeenEdited ? overlay.value : source);
}

function unmountOne(pre: HTMLElement): void {
  activeRuns.get(pre)?.stop();
  activeRuns.delete(pre);

  pre.querySelector('.ugoku-edit-overlay')?.remove();

  // First call removes the controls div; .remove() shifts nextElementSibling
  // forward as a side effect, so the second call now removes the output panel.
  pre.nextElementSibling?.remove();
  pre.nextElementSibling?.remove();

  delete pre.dataset.ugokuMounted;
}
```

- [ ] **Step 4: Run to verify the mount.ts tests pass**

Run: `npx vitest run packages/core/src/mount/mount.browser.test.ts`
Expected: PASS — all tests in the file (existing `run` tests + updated/new `run-edit` tests)

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all tests pass; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/mount/mount.ts packages/core/src/mount/mount.browser.test.ts
git commit -m "feat: wire editable overlay, persistence, and reset into mount()"
```

---

### Task 5: No-bundler standalone chunk

**Files:**
- Create: `packages/core/src/edit/standalone-entry.ts`
- Modify: `packages/core/package.json`
- Create: `packages/core/scripts/build-edit-chunk.mjs`
- Create: `scripts/verify-standalone-chunk.mjs`
- Modify: `package.json` (root)

**Interfaces:**
- Consumes: `spliceHighlightedHtml` from `./splice.ts` (Task 2).
- Produces: `packages/core/dist/edit-standalone.js` (build output, not committed), exporting `highlightInto(pre: HTMLElement, code: string): Promise<void>` — same name/signature as Task 3's `editor.ts`, but with a fixed JS/TS + github-light/github-dark preset baked in instead of full bundled-language/theme coverage. No other task imports this file; it's verified standalone.

**Context:** This is an independent, self-contained deliverable (see Global Constraints) — it does not integrate with `mount.ts`. The verification script below builds real confidence that the output file actually works outside any bundler, using a plain `node:http` static server plus a real headless Chromium (via the `playwright` package already a root devDependency) — the same technique already proven in this project's pre-plan spikes.

- [ ] **Step 1: Implement `standalone-entry.ts`**

```ts
// packages/core/src/edit/standalone-entry.ts
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import javascript from 'shiki/langs/javascript.mjs';
import typescript from 'shiki/langs/typescript.mjs';
import githubLight from 'shiki/themes/github-light.mjs';
import githubDark from 'shiki/themes/github-dark.mjs';
import { spliceHighlightedHtml } from './splice.ts';
import type { HighlighterCore } from 'shiki/core';

const SUPPORTED_LANGS = new Set(['javascript', 'typescript']);
const SUPPORTED_THEMES = new Set(['github-light', 'github-dark']);

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      engine: createJavaScriptRegexEngine(),
      langs: [javascript, typescript],
      themes: [githubLight, githubDark],
    });
  }
  return highlighterPromise;
}

export async function highlightInto(pre: HTMLElement, code: string): Promise<void> {
  const lang = pre.dataset.ugokuLang ?? '';
  const singleTheme = pre.dataset.ugokuTheme;
  const lightTheme = pre.dataset.ugokuThemeLight;
  const darkTheme = pre.dataset.ugokuThemeDark;
  const themeNames = singleTheme ? [singleTheme] : [lightTheme, darkTheme].filter((t): t is string => !!t);

  const unsupported =
    !SUPPORTED_LANGS.has(lang) || themeNames.length === 0 || !themeNames.every((t) => SUPPORTED_THEMES.has(t));
  if (unsupported) return;

  const highlighter = await getHighlighter();
  const html = singleTheme
    ? highlighter.codeToHtml(code, { lang, theme: singleTheme })
    : highlighter.codeToHtml(code, { lang, themes: { light: lightTheme!, dark: darkTheme! } });

  spliceHighlightedHtml(pre, html);
}
```

- [ ] **Step 2: Add the build script and its dependency/script entry**

Current `packages/core/package.json` (after Task 3):

```json
{
  "name": "@ugoku/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./edit": "./src/edit/editor.ts"
  },
  "dependencies": {
    "shiki": "^4.5.0"
  }
}
```

New content:

```json
{
  "name": "@ugoku/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./edit": "./src/edit/editor.ts"
  },
  "scripts": {
    "build:edit-chunk": "node scripts/build-edit-chunk.mjs"
  },
  "dependencies": {
    "shiki": "^4.5.0"
  },
  "devDependencies": {
    "esbuild": "^0.24.0"
  }
}
```

```js
// packages/core/scripts/build-edit-chunk.mjs
import { build } from 'esbuild';

await build({
  entryPoints: ['src/edit/standalone-entry.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  outfile: 'dist/edit-standalone.js',
});

console.log('built dist/edit-standalone.js');
```

Run: `pnpm install && pnpm --filter @ugoku/core build:edit-chunk`
Expected: `built dist/edit-standalone.js` printed; `packages/core/dist/edit-standalone.js` exists.

- [ ] **Step 3: Confirm the output is self-contained and within the measured size budget**

```bash
grep -c "^import " packages/core/dist/edit-standalone.js
ls -la packages/core/dist/edit-standalone.js
```

Expected: the `grep -c` count is `0` (no remaining bare imports — fully self-contained); file size is under 600,000 bytes (measured at ~530KB minified during this plan's pre-work spike; 600KB leaves headroom without being meaningless).

- [ ] **Step 4: Write and run the standalone verification script**

```js
// scripts/verify-standalone-chunk.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST_FILE = path.join(ROOT, 'packages/core/dist/edit-standalone.js');

const FIXTURE_HTML = `<!doctype html>
<html>
<body>
<pre data-ugoku-lang="typescript" data-ugoku-theme="github-light"><code>let x: number = 1;</code></pre>
<script type="module">
  import { highlightInto } from '/edit-standalone.js';
  const pre = document.querySelector('pre');
  highlightInto(pre, pre.querySelector('code').textContent).then(() => {
    document.title = pre.className.includes('shiki') ? 'DONE' : 'FAILED';
  }).catch((e) => {
    document.title = 'FAILED: ' + e.message;
  });
</script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  if (req.url === '/edit-standalone.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.end(await readFile(DIST_FILE));
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.end(FIXTURE_HTML);
});

await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => document.title !== '');
const title = await page.title();
await browser.close();
server.close();

if (title !== 'DONE') {
  console.error('FAILED:', title);
  process.exit(1);
}
console.log('PASS: standalone chunk re-highlighted a block with no bundler present');
```

Run: `node scripts/verify-standalone-chunk.mjs`
Expected: `PASS: standalone chunk re-highlighted a block with no bundler present`

- [ ] **Step 5: Add the root convenience scripts**

Current root `package.json` `scripts` block (after the docs-dogfood-site plan):

```json
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "dev:docs": "pnpm --filter ugoku-docs dev",
    "test:e2e": "pnpm --filter ugoku-e2e test"
  },
```

New `scripts` block:

```json
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "dev:docs": "pnpm --filter ugoku-docs dev",
    "test:e2e": "pnpm --filter ugoku-e2e test",
    "build:edit-chunk": "pnpm --filter @ugoku/core build:edit-chunk",
    "verify:edit-chunk": "pnpm build:edit-chunk && node scripts/verify-standalone-chunk.mjs"
  },
```

Run: `pnpm verify:edit-chunk`
Expected: `PASS: standalone chunk re-highlighted a block with no bundler present` (confirms the composed script works end-to-end, not just the individual pieces)

- [ ] **Step 6: Run the full suite and typecheck to confirm no regression**

Run: `pnpm test && pnpm typecheck`
Expected: all tests pass; typecheck exits 0 (note: `standalone-entry.ts` has no dedicated Vitest test — it's covered by the verification script above, not the Vitest suite).

- [ ] **Step 7: Commit**

Build output (`packages/core/dist/`) is a build artifact, not committed — add a `.gitignore` entry for it alongside the other files.

```bash
echo "dist/" >> packages/core/.gitignore
git add packages/core/src/edit/standalone-entry.ts packages/core/package.json packages/core/scripts/build-edit-chunk.mjs packages/core/.gitignore scripts/verify-standalone-chunk.mjs package.json pnpm-lock.yaml
git commit -m "feat: add self-hostable standalone edit chunk for no-bundler sites"
```

---

### Task 6: Dogfood in `docs/` and extend the e2e suite

**Files:**
- Modify: `e2e/dogfood.spec.ts`

**Interfaces:**
- Consumes: the existing `run edit` block already present on `docs/index.md` (added by the docs-dogfood-site plan's Task 2 — no new markdown file needed) and the full `run-edit` behavior from Task 4.
- Produces: nothing further consumed by other tasks — this is the final proof the whole feature works against a real built site.

**Context:** `docs/index.md` already contains a `run edit` block (the `total: 5` counting-loop example) — read it to confirm before writing the test. The existing `e2e/dogfood.spec.ts` already has two tests (home-page mount/run, SPA navigation) from the docs-dogfood-site plan; this task adds a third.

- [ ] **Step 1: Write the new failing e2e test**

Append to `e2e/dogfood.spec.ts`:

```ts
test('editing a run-edit block persists across reload, re-highlights, and Reset restores it', async ({ page }) => {
  await page.goto('/');

  const overlay = page.locator('pre[data-ugoku-mode="run-edit"] .ugoku-edit-overlay');
  await overlay.click();
  await overlay.fill('console.log("edited");');

  // Wait past the 400ms save debounce before reloading.
  await page.waitForTimeout(600);
  await page.reload();

  const reloadedOverlay = page.locator('pre[data-ugoku-mode="run-edit"] .ugoku-edit-overlay');
  await expect(reloadedOverlay).toHaveValue('console.log("edited");');
  await expect(page.locator('pre[data-ugoku-mode="run-edit"] code')).toContainText('edited');

  const runBtn = page.locator('pre[data-ugoku-mode="run-edit"] + .ugoku-controls .ugoku-run-btn');
  await runBtn.click();
  const panel = page.locator('pre[data-ugoku-mode="run-edit"] + .ugoku-controls + .ugoku-output-panel');
  await expect(panel).toContainText('edited');

  const resetBtn = page.locator('pre[data-ugoku-mode="run-edit"] + .ugoku-controls .ugoku-reset-btn');
  await resetBtn.click();
  await expect(reloadedOverlay).toHaveValue('');
});
```

- [ ] **Step 2: Run the e2e suite**

Run: `pnpm --filter ugoku-e2e test`
Expected: `3 passed` (the two existing tests plus this new one)

- [ ] **Step 3: Run the full Vitest suite and typecheck to confirm no regression**

Run: `pnpm test && pnpm typecheck`
Expected: all tests pass; typecheck exits 0.

- [ ] **Step 4: Commit**

```bash
git add e2e/dogfood.spec.ts
git commit -m "test: add e2e coverage for edit persistence, re-highlight, and reset"
```
