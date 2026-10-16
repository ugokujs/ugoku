# Mount / Run Button Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `@ugoku/core` `mount(root)` / `unmount(root)` API that scans a page for `<pre data-ugoku-mode>` blocks, injects a Run/Stop control row and an output panel, and wires them to the existing `runCode` worker runner and `OutputPanel`.

**Architecture:** A new `packages/core/src/mount/mount.ts` module does pure DOM scanning and wiring — no framework awareness, operates on any `ParentNode`. It consumes the already-shipped `runCode`/`RunHandle` (worker runner) and `OutputPanel` (output panel) unchanged, except for one small addition: `OutputPanel` gains a `clear()` method so each Run click can wipe the previous run's output before starting the next.

**Tech Stack:** TypeScript, the existing pnpm/Vitest/Playwright (Chromium) toolchain. No new dependencies.

## Global Constraints

- Data attribute: `data-ugoku-mode` with values `"run"` | `"run-edit"`. `mount()` only checks for its *presence* to decide whether to mount — it does not branch on the specific value; both modes get identical treatment in this task (no editor overlay, that's v0.2).
- Idempotency marker: `data-ugoku-mounted="true"`, set on first mount. `mount()`'s scan query must exclude pres that already carry it, so calling `mount()` again on overlapping DOM is a no-op for already-mounted blocks.
- `unmount(root)` must stop any in-flight `RunHandle` for every `pre[data-ugoku-mounted]` under `root` before removing the injected elements — this prevents an orphaned worker when a VitePress SPA navigates away from the page.
- The output panel starts hidden (`element.hidden = true`) and only becomes visible on the first `onConsole`/`onError` callback of a run — not immediately on Run click.
- Each Run click calls `panel.clear()` before starting the new run, so output doesn't accumulate across repeated runs.
- Keep comments to a minimum — only where a non-obvious WHY needs explaining.
- No build tooling beyond the existing pnpm/Vitest/Playwright/tsc toolchain.

---

## File Structure

```
packages/core/src/output-panel/output-panel.ts              # modified
packages/core/src/output-panel/output-panel.browser.test.ts  # modified
packages/core/src/mount/mount.ts
packages/core/src/mount/mount.browser.test.ts
packages/core/src/mount/index.ts
```

---

### Task 1: OutputPanel.clear()

**Files:**
- Modify: `packages/core/src/output-panel/output-panel.ts`
- Modify: `packages/core/src/output-panel/output-panel.browser.test.ts`

**Interfaces:**
- Consumes: the existing `OutputPanel` class (unchanged otherwise).
- Produces: `OutputPanel.clear(): void` — wipes every previously appended line. Task 2's Run-click handler calls this before each run.

- [ ] **Step 1: Write the failing test**

Append to `packages/core/src/output-panel/output-panel.browser.test.ts`:
```ts
test('clear() removes all previously appended lines', () => {
  const panel = new OutputPanel();
  panel.appendConsole({ level: 'log', args: [{ kind: 'primitive', value: 'first' }] });
  panel.appendConsole({ level: 'log', args: [{ kind: 'primitive', value: 'second' }] });
  expect(panel.element.children.length).toBe(2);

  panel.clear();

  expect(panel.element.children.length).toBe(0);
  expect(panel.element.textContent).toBe('');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test output-panel`
Expected: FAIL — `panel.clear is not a function`.

- [ ] **Step 3: Write the implementation**

In `packages/core/src/output-panel/output-panel.ts`, add a `clear()` method to the `OutputPanel` class, placed after `appendError` and before the private methods:
```ts
  clear(): void {
    this.element.replaceChildren();
  }
```

The full file should read:
```ts
import { renderValue } from './render-value';
import type { ConsoleMessage, SerializedError } from '../runner/protocol';

export class OutputPanel {
  readonly element: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'ugoku-output-panel';
  }

  appendConsole(message: Pick<ConsoleMessage, 'level' | 'args'>): void {
    const line = document.createElement('div');
    line.className = `ugoku-line ugoku-line-${message.level}`;
    message.args.forEach((arg, index) => {
      if (index > 0) line.append(' ');
      line.appendChild(renderValue(arg));
    });
    this.appendLine(line);
  }

  appendError(error: SerializedError): void {
    const line = document.createElement('div');
    line.className = 'ugoku-line ugoku-line-run-error';

    const banner = document.createElement('span');
    banner.className = 'ugoku-run-error-banner';
    banner.textContent = 'run failed';
    line.appendChild(banner);

    line.appendChild(
      renderValue({ kind: 'error', name: error.name, message: error.message, stack: error.stack }),
    );
    this.appendLine(line);
  }

  clear(): void {
    this.element.replaceChildren();
  }

  private appendLine(line: HTMLElement): void {
    const wasAtBottom = this.isAtBottom();
    this.element.appendChild(line);
    if (wasAtBottom) this.scrollToBottom();
  }

  private isAtBottom(): boolean {
    const threshold = 4;
    return this.element.scrollHeight - this.element.scrollTop - this.element.clientHeight <= threshold;
  }

  private scrollToBottom(): void {
    this.element.scrollTop = this.element.scrollHeight;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test output-panel`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/output-panel/output-panel.ts packages/core/src/output-panel/output-panel.browser.test.ts
git commit -m "feat: add OutputPanel.clear()"
```

---

### Task 2: mount()/unmount() DOM wiring

**Files:**
- Create: `packages/core/src/mount/mount.ts`
- Create: `packages/core/src/mount/mount.browser.test.ts`
- Create: `packages/core/src/mount/index.ts`

**Interfaces:**
- Consumes: `runCode`, `RunCodeCallbacks`, `RunHandle` from `../runner/run-code`; `ConsoleMessage` (for its `level` field's literal union type) from `../runner/protocol`; `OutputPanel` (including the `clear()` method from Task 1) from `../output-panel/output-panel`.
- Produces: `mount(root: ParentNode): void` and `unmount(root: ParentNode): void`, the package's top-level DOM integration API.

- [ ] **Step 1: Write the failing tests**

`packages/core/src/mount/mount.browser.test.ts`:
```ts
import { expect, test, vi } from 'vitest';
import { mount, unmount } from './mount';

function createPre(mode: string, source: string): HTMLElement {
  const pre = document.createElement('pre');
  pre.dataset.ugokuMode = mode;
  pre.textContent = source;
  document.body.appendChild(pre);
  return pre;
}

test('mounts a controls row and a hidden output panel for a "run" pre', () => {
  const pre = createPre('run', 'console.log(1)');
  mount(document.body);

  const controls = pre.nextElementSibling as HTMLElement;
  expect(controls.className).toBe('ugoku-controls');
  expect(controls.querySelector('.ugoku-run-btn')).not.toBeNull();
  expect(controls.querySelector('.ugoku-stop-btn')).not.toBeNull();

  const panel = controls.nextElementSibling as HTMLElement;
  expect(panel.className).toBe('ugoku-output-panel');
  expect(panel.hidden).toBe(true);

  unmount(document.body);
  pre.remove();
});

test('mounts a "run-edit" pre identically to "run"', () => {
  const pre = createPre('run-edit', 'console.log(1)');
  mount(document.body);

  const controls = pre.nextElementSibling as HTMLElement;
  expect(controls.className).toBe('ugoku-controls');

  unmount(document.body);
  pre.remove();
});

test('leaves a pre without data-ugoku-mode untouched', () => {
  const pre = document.createElement('pre');
  pre.textContent = 'plain code';
  document.body.appendChild(pre);

  mount(document.body);

  expect(pre.nextElementSibling).toBeNull();

  pre.remove();
});

test('mounting twice does not double-inject', () => {
  const pre = createPre('run', 'console.log(1)');
  mount(document.body);
  mount(document.body);

  const controls = pre.nextElementSibling as HTMLElement;
  const panel = controls.nextElementSibling as HTMLElement;
  expect(panel.nextElementSibling).toBeNull();

  unmount(document.body);
  pre.remove();
});

test('clicking Run executes the pre source and renders console output', async () => {
  const pre = createPre('run', 'console.log("hi")');
  mount(document.body);

  const controls = pre.nextElementSibling as HTMLElement;
  const panel = controls.nextElementSibling as HTMLElement;
  const runBtn = controls.querySelector('.ugoku-run-btn') as HTMLButtonElement;
  const stopBtn = controls.querySelector('.ugoku-stop-btn') as HTMLButtonElement;

  runBtn.click();
  expect(runBtn.disabled).toBe(true);
  expect(stopBtn.disabled).toBe(false);

  await vi.waitFor(() => {
    expect(panel.hidden).toBe(false);
    expect(panel.textContent).toContain('"hi"');
  });

  await vi.waitFor(() => {
    expect(runBtn.disabled).toBe(false);
    expect(stopBtn.disabled).toBe(true);
  });

  unmount(document.body);
  pre.remove();
});

test('clicking Run a second time clears the previous output', async () => {
  const pre = createPre('run', 'console.log("hello")');
  mount(document.body);

  const controls = pre.nextElementSibling as HTMLElement;
  const panel = controls.nextElementSibling as HTMLElement;
  const runBtn = controls.querySelector('.ugoku-run-btn') as HTMLButtonElement;

  runBtn.click();
  await vi.waitFor(() => expect(panel.querySelectorAll('.ugoku-line').length).toBe(1));

  runBtn.click();
  await vi.waitFor(() => expect(panel.querySelectorAll('.ugoku-line').length).toBe(1));

  unmount(document.body);
  pre.remove();
});

test('clicking Stop ends an in-flight run without producing further console output', async () => {
  const pre = createPre('run', 'setTimeout(() => console.log("late"), 300); console.log("early");');
  mount(document.body);

  const controls = pre.nextElementSibling as HTMLElement;
  const panel = controls.nextElementSibling as HTMLElement;
  const runBtn = controls.querySelector('.ugoku-run-btn') as HTMLButtonElement;
  const stopBtn = controls.querySelector('.ugoku-stop-btn') as HTMLButtonElement;

  runBtn.click();
  await vi.waitFor(() => expect(panel.textContent).toContain('"early"'));

  stopBtn.click();
  expect(runBtn.disabled).toBe(false);
  expect(stopBtn.disabled).toBe(true);

  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(panel.textContent).not.toContain('"late"');

  unmount(document.body);
  pre.remove();
});

test('unmount stops an in-flight run and removes the injected elements', async () => {
  const pre = createPre('run', 'setTimeout(() => console.log("late"), 300); console.log("early");');
  mount(document.body);

  const controls = pre.nextElementSibling as HTMLElement;
  const panel = controls.nextElementSibling as HTMLElement;
  const runBtn = controls.querySelector('.ugoku-run-btn') as HTMLButtonElement;

  runBtn.click();
  await vi.waitFor(() => expect(panel.textContent).toContain('"early"'));

  unmount(document.body);
  expect(pre.nextElementSibling).toBeNull();

  await new Promise((resolve) => setTimeout(resolve, 400));
  expect(panel.textContent).not.toContain('"late"');

  pre.remove();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test mount`
Expected: FAIL — `mount.ts` does not exist yet.

- [ ] **Step 3: Write the implementation**

`packages/core/src/mount/mount.ts`:
```ts
import { runCode } from '../runner/run-code';
import type { RunHandle } from '../runner/run-code';
import { OutputPanel } from '../output-panel/output-panel';
import type { ConsoleMessage } from '../runner/protocol';

const activeRuns = new WeakMap<HTMLElement, RunHandle>();

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
    setRunning(true);
    const handle = runCode(source, {
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

function unmountOne(pre: HTMLElement): void {
  activeRuns.get(pre)?.stop();
  activeRuns.delete(pre);

  pre.nextElementSibling?.remove();
  pre.nextElementSibling?.remove();

  delete pre.dataset.ugokuMounted;
}
```

Note on `unmountOne`: the two `pre.nextElementSibling?.remove()` calls are intentional, not a typo — after the first call removes the controls div, `pre.nextElementSibling` now refers to the output panel, so the second call removes that. This avoids needing to capture both references before either exists in a reusable variable, since `.remove()` moves `nextElementSibling` forward as a side effect.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test mount`
Expected: PASS, 8 tests.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm test`
Expected: all test files PASS, no regressions.

Run: `pnpm typecheck`
Expected: clean, no errors.

- [ ] **Step 6: Write the barrel export**

`packages/core/src/mount/index.ts`:
```ts
export { mount, unmount } from './mount';
```

- [ ] **Step 7: Run the full suite once more**

Run: `pnpm test`
Expected: all test files PASS (the barrel file has no logic of its own, so no new tests are needed for it).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/mount/mount.ts packages/core/src/mount/mount.browser.test.ts packages/core/src/mount/index.ts
git commit -m "feat: add mount()/unmount() DOM wiring for Run/Stop + output panel"
```
