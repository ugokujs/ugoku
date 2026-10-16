# Worker Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `@ugoku/core`'s runner — the module Web Worker bootstrap and the `runCode()` public API — per `docs/superpowers/specs/2026-10-15-worker-protocol-design.md`.

**Architecture:** A pnpm monorepo with a single `@ugoku/core` package. The runner is split into protocol types, a pure `serializeValue` helper, a worker bootstrap source generator, and the main-thread `runCode()` function that owns the Worker lifecycle (creation, timeout, termination). Tests run against a real Chromium instance via Vitest's browser mode, since the behavior under test (Worker, Blob, dynamic `import()`, `postMessage`) has no meaningful jsdom/Node equivalent.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest + `@vitest/browser` (Playwright/Chromium provider). No bundler/build step in this plan — tests run directly against TS source via Vitest's esbuild transform.

## Global Constraints

- Keep comments to a minimum — only where a non-obvious WHY needs explaining, never to restate what the code does.
- No build tooling beyond what's needed to run tests in this plan; packaging/publishing is out of scope.
- Fresh Worker per run, terminated on done/error/timeout/stop (per spec) — never reused.
- Default hard timeout is 10000ms, hardcoded (per spec) — no configuration surface yet.
- `SerializedValue` stays the placeholder shape from the spec (`primitive` / `placeholder` preview) — the real display-tree format is a separate future spec, not part of this plan.

---

## File Structure

```
pnpm-workspace.yaml
package.json                              # root, workspace + devDeps
tsconfig.json                             # root, editor type support
vitest.config.ts                          # root, browser mode config
packages/core/package.json
packages/core/src/runner/protocol.ts      # shared message/type definitions
packages/core/src/runner/serialize-value.ts
packages/core/src/runner/serialize-value.test.ts
packages/core/src/runner/worker-source.ts # generates the worker bootstrap script
packages/core/src/runner/worker-source.browser.test.ts
packages/core/src/runner/run-code.ts      # public runCode() API
packages/core/src/runner/run-code.browser.test.ts
packages/core/src/runner/index.ts         # barrel export
packages/core/src/smoke.browser.test.ts   # Task 1 toolchain smoke test
```

---

### Task 1: Scaffold the monorepo and browser test toolchain

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `packages/core/package.json`
- Create: `packages/core/src/smoke.browser.test.ts`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: a working `pnpm test` command that runs Vitest in real Chromium, for every later task to rely on.

- [ ] **Step 1: Create the workspace file**

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 2: Create the root package.json**

`package.json`:
```json
{
  "name": "ugoku-monorepo",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  }
}
```

- [ ] **Step 3: Create the core package's package.json**

`packages/core/package.json`:
```json
{
  "name": "@ugoku/core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts"
}
```

- [ ] **Step 4: Create the root tsconfig**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "WebWorker"],
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["packages/*/src"]
}
```

- [ ] **Step 5: Install dependencies**

Run: `pnpm add -D vitest @vitest/browser playwright typescript`

- [ ] **Step 6: Install the Chromium browser for Playwright**

Run: `pnpm exec playwright install chromium`

- [ ] **Step 7: Create the Vitest browser-mode config**

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    browser: {
      enabled: true,
      provider: 'playwright',
      instances: [{ browser: 'chromium' }],
    },
  },
});
```

- [ ] **Step 8: Write the toolchain smoke test**

`packages/core/src/smoke.browser.test.ts`:
```ts
import { expect, test } from 'vitest';

test('runs in a real browser context with Worker and Blob available', () => {
  expect(typeof Worker).toBe('function');
  expect(typeof Blob).toBe('function');
});
```

- [ ] **Step 9: Run the test suite and confirm it passes**

Run: `pnpm test`
Expected: 1 test file, 1 test, PASS.

- [ ] **Step 10: Commit**

```bash
git add pnpm-workspace.yaml package.json tsconfig.json vitest.config.ts packages/core/package.json packages/core/src/smoke.browser.test.ts
git commit -m "chore: scaffold pnpm monorepo with Vitest browser test toolchain"
```

---

### Task 2: Protocol types and the serializeValue placeholder

**Files:**
- Create: `packages/core/src/runner/protocol.ts`
- Create: `packages/core/src/runner/serialize-value.ts`
- Test: `packages/core/src/runner/serialize-value.test.ts`

**Interfaces:**
- Consumes: nothing beyond Task 1's toolchain.
- Produces:
  - `protocol.ts` exports: `SerializedValue`, `SerializedError`, `RunMessage`, `ConsoleMessage`, `DoneMessage`, `ErrorMessage`, `MainToWorkerMessage`, `WorkerToMainMessage`.
  - `serialize-value.ts` exports: `serializeValue(value: unknown): SerializedValue`.

- [ ] **Step 1: Write the failing test**

`packages/core/src/runner/serialize-value.test.ts`:
```ts
import { expect, test } from 'vitest';
import { serializeValue } from './serialize-value';

test('passes primitives through unchanged', () => {
  expect(serializeValue('hi')).toEqual({ kind: 'primitive', value: 'hi' });
  expect(serializeValue(42)).toEqual({ kind: 'primitive', value: 42 });
  expect(serializeValue(true)).toEqual({ kind: 'primitive', value: true });
  expect(serializeValue(null)).toEqual({ kind: 'primitive', value: null });
  expect(serializeValue(undefined)).toEqual({ kind: 'primitive', value: undefined });
});

test('falls back to a string preview for everything else', () => {
  expect(serializeValue({ a: 1 })).toEqual({ kind: 'placeholder', preview: '[object Object]' });
  expect(serializeValue([1, 2])).toEqual({ kind: 'placeholder', preview: '1,2' });
  expect(serializeValue(new Error('boom'))).toEqual({ kind: 'placeholder', preview: 'Error: boom' });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test serialize-value`
Expected: FAIL — `serialize-value.ts` does not exist yet.

- [ ] **Step 3: Write the protocol types**

`packages/core/src/runner/protocol.ts`:
```ts
export type SerializedValue =
  | { kind: 'primitive'; value: string | number | boolean | null | undefined }
  | { kind: 'placeholder'; preview: string };

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

export interface RunMessage {
  type: 'run';
  runId: string;
  source: string;
  timeoutMs: number;
}

export interface ConsoleMessage {
  type: 'console';
  runId: string;
  level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  args: SerializedValue[];
}

export interface DoneMessage {
  type: 'done';
  runId: string;
}

export interface ErrorMessage {
  type: 'error';
  runId: string;
  error: SerializedError;
}

export type MainToWorkerMessage = RunMessage;
export type WorkerToMainMessage = ConsoleMessage | DoneMessage | ErrorMessage;
```

- [ ] **Step 4: Write the serializeValue implementation**

`packages/core/src/runner/serialize-value.ts`:
```ts
import type { SerializedValue } from './protocol';

export function serializeValue(value: unknown): SerializedValue {
  if (value === null) return { kind: 'primitive', value: null };
  if (value === undefined) return { kind: 'primitive', value: undefined };
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return { kind: 'primitive', value: value as string | number | boolean };
  }
  return { kind: 'placeholder', preview: String(value) };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test serialize-value`
Expected: PASS, 2 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/runner/protocol.ts packages/core/src/runner/serialize-value.ts packages/core/src/runner/serialize-value.test.ts
git commit -m "feat: add runner protocol types and serializeValue placeholder"
```

---

### Task 3: Worker bootstrap source generator

**Files:**
- Create: `packages/core/src/runner/worker-source.ts`
- Test: `packages/core/src/runner/worker-source.browser.test.ts`

**Interfaces:**
- Consumes: `serializeValue` from `./serialize-value` (Task 2), embedded into the generated script via `serializeValue.toString()`.
- Produces: `createWorkerSource(): string` — a complete worker module script, independent of Task 4's `runCode()`.

- [ ] **Step 1: Write the failing test**

`packages/core/src/runner/worker-source.browser.test.ts`:
```ts
import { expect, test } from 'vitest';
import { createWorkerSource } from './worker-source';

function createTestWorker(): Worker {
  const url = URL.createObjectURL(new Blob([createWorkerSource()], { type: 'text/javascript' }));
  return new Worker(url, { type: 'module' });
}

test('streams a console message then posts done', async () => {
  const worker = createTestWorker();
  const messages: unknown[] = [];

  await new Promise<void>((resolve) => {
    worker.onmessage = (event) => {
      messages.push(event.data);
      if ((event.data as { type: string }).type === 'done') resolve();
    };
    worker.postMessage({ type: 'run', runId: 'test-1', source: `console.log('hi')`, timeoutMs: 1000 });
  });

  worker.terminate();
  expect(messages).toEqual([
    { type: 'console', runId: 'test-1', level: 'log', args: [{ kind: 'primitive', value: 'hi' }] },
    { type: 'done', runId: 'test-1' },
  ]);
});

test('posts error for an uncaught exception', async () => {
  const worker = createTestWorker();
  const messages: unknown[] = [];

  await new Promise<void>((resolve) => {
    worker.onmessage = (event) => {
      messages.push(event.data);
      resolve();
    };
    worker.postMessage({ type: 'run', runId: 'test-2', source: `throw new Error('boom')`, timeoutMs: 1000 });
  });

  worker.terminate();
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({
    type: 'error',
    runId: 'test-2',
    error: { name: 'Error', message: 'boom' },
  });
});

test('waits for a pending setTimeout before posting done', async () => {
  const worker = createTestWorker();
  const messages: unknown[] = [];
  const start = Date.now();

  await new Promise<void>((resolve) => {
    worker.onmessage = (event) => {
      messages.push(event.data);
      if ((event.data as { type: string }).type === 'done') resolve();
    };
    worker.postMessage({
      type: 'run',
      runId: 'test-3',
      source: `setTimeout(() => console.log('late'), 100)`,
      timeoutMs: 1000,
    });
  });

  worker.terminate();
  expect(Date.now() - start).toBeGreaterThanOrEqual(100);
  expect(messages).toEqual([
    { type: 'console', runId: 'test-3', level: 'log', args: [{ kind: 'primitive', value: 'late' }] },
    { type: 'done', runId: 'test-3' },
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test worker-source`
Expected: FAIL — `worker-source.ts` does not exist yet.

- [ ] **Step 3: Write the worker bootstrap generator**

`packages/core/src/runner/worker-source.ts`:
```ts
import { serializeValue } from './serialize-value';

export function createWorkerSource(): string {
  return `
const serializeValue = ${serializeValue.toString()};

const nativeSetTimeout = self.setTimeout.bind(self);
const nativeSetInterval = self.setInterval.bind(self);
const nativeClearTimeout = self.clearTimeout.bind(self);
const nativeClearInterval = self.clearInterval.bind(self);

let pendingTimers = 0;
const activeTimeouts = new Set();
const activeIntervals = new Set();

self.setTimeout = (fn, delay, ...args) => {
  const id = nativeSetTimeout(() => {
    activeTimeouts.delete(id);
    pendingTimers--;
    fn(...args);
  }, delay);
  activeTimeouts.add(id);
  pendingTimers++;
  return id;
};

self.clearTimeout = (id) => {
  if (activeTimeouts.has(id)) {
    activeTimeouts.delete(id);
    pendingTimers--;
  }
  nativeClearTimeout(id);
};

self.setInterval = (fn, delay, ...args) => {
  const id = nativeSetInterval(fn, delay, ...args);
  activeIntervals.add(id);
  pendingTimers++;
  return id;
};

self.clearInterval = (id) => {
  if (activeIntervals.has(id)) {
    activeIntervals.delete(id);
    pendingTimers--;
  }
  nativeClearInterval(id);
};

let currentRunId = null;

for (const level of ['log', 'warn', 'error', 'info', 'debug']) {
  console[level] = (...args) => {
    self.postMessage({ type: 'console', runId: currentRunId, level, args: args.map(serializeValue) });
  };
}

function waitForIdle(runId) {
  if (pendingTimers === 0) {
    self.postMessage({ type: 'done', runId });
    return;
  }
  nativeSetTimeout(() => waitForIdle(runId), 10);
}

self.onmessage = async (event) => {
  const message = event.data;
  if (message.type !== 'run') return;
  currentRunId = message.runId;
  try {
    const userUrl = URL.createObjectURL(new Blob([message.source], { type: 'text/javascript' }));
    await import(userUrl);
    waitForIdle(message.runId);
  } catch (error) {
    self.postMessage({
      type: 'error',
      runId: message.runId,
      error: { name: error?.name ?? 'Error', message: error?.message ?? String(error), stack: error?.stack },
    });
  }
};
`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm test worker-source`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/runner/worker-source.ts packages/core/src/runner/worker-source.browser.test.ts
git commit -m "feat: add worker bootstrap source generator"
```

---

### Task 4: Public runCode() API

**Files:**
- Create: `packages/core/src/runner/run-code.ts`
- Create: `packages/core/src/runner/index.ts`
- Test: `packages/core/src/runner/run-code.browser.test.ts`

**Interfaces:**
- Consumes: `createWorkerSource` from `./worker-source` (Task 3); `WorkerToMainMessage` from `./protocol` (Task 2).
- Produces: `runCode(source: string, callbacks: RunCodeCallbacks, timeoutMs?: number): RunHandle`, plus the `RunCodeCallbacks` and `RunHandle` types, re-exported from `index.ts`.

- [ ] **Step 1: Write the failing tests**

`packages/core/src/runner/run-code.browser.test.ts`:
```ts
import { expect, test, vi } from 'vitest';
import { runCode } from './run-code';

test('streams console output and reports done on the golden path', async () => {
  const consoleCalls: Array<{ level: string; args: unknown[] }> = [];
  const onDone = vi.fn();

  await new Promise<void>((resolve) => {
    runCode(`console.log('hi', 42);`, {
      onConsole: (level, args) => consoleCalls.push({ level, args }),
      onDone: () => { onDone(); resolve(); },
      onError: () => resolve(),
      onTimeout: () => resolve(),
      onStopped: () => resolve(),
    });
  });

  expect(consoleCalls).toEqual([
    { level: 'log', args: [{ kind: 'primitive', value: 'hi' }, { kind: 'primitive', value: 42 }] },
  ]);
  expect(onDone).toHaveBeenCalledOnce();
});

test('reports a structured error on an uncaught exception', async () => {
  const onError = vi.fn();

  await new Promise<void>((resolve) => {
    runCode(`throw new Error('boom');`, {
      onConsole: () => {},
      onDone: () => resolve(),
      onError: (error) => { onError(error); resolve(); },
      onTimeout: () => resolve(),
      onStopped: () => resolve(),
    });
  });

  expect(onError).toHaveBeenCalledWith(expect.objectContaining({ name: 'Error', message: 'boom' }));
});

test('terminates and reports timeout for a synchronous infinite loop', async () => {
  const onTimeout = vi.fn();

  await new Promise<void>((resolve) => {
    runCode(`while (true) {}`, {
      onConsole: () => {},
      onDone: () => resolve(),
      onError: () => resolve(),
      onTimeout: () => { onTimeout(); resolve(); },
      onStopped: () => resolve(),
    }, 100);
  });

  expect(onTimeout).toHaveBeenCalledOnce();
}, 2000);

test('stop() terminates a pending run and reports stopped', async () => {
  const onStopped = vi.fn();

  await new Promise<void>((resolve) => {
    const handle = runCode(`await new Promise(() => {});`, {
      onConsole: () => {},
      onDone: () => resolve(),
      onError: () => resolve(),
      onTimeout: () => resolve(),
      onStopped: () => { onStopped(); resolve(); },
    }, 5000);
    setTimeout(() => handle.stop(), 50);
  });

  expect(onStopped).toHaveBeenCalledOnce();
});

test('waits for a pending setTimeout before reporting done', async () => {
  const consoleCalls: unknown[] = [];
  const onDone = vi.fn();
  const start = Date.now();

  await new Promise<void>((resolve) => {
    runCode(`setTimeout(() => console.log('late'), 100);`, {
      onConsole: (level, args) => consoleCalls.push(args),
      onDone: () => { onDone(); resolve(); },
      onError: () => resolve(),
      onTimeout: () => resolve(),
      onStopped: () => resolve(),
    });
  });

  expect(Date.now() - start).toBeGreaterThanOrEqual(100);
  expect(consoleCalls).toHaveLength(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test run-code`
Expected: FAIL — `run-code.ts` does not exist yet.

- [ ] **Step 3: Write the runCode implementation**

`packages/core/src/runner/run-code.ts`:
```ts
import { createWorkerSource } from './worker-source';
import type { SerializedError, SerializedValue, WorkerToMainMessage } from './protocol';

let workerSourceUrl: string | null = null;

function getWorkerSourceUrl(): string {
  if (!workerSourceUrl) {
    const blob = new Blob([createWorkerSource()], { type: 'text/javascript' });
    workerSourceUrl = URL.createObjectURL(blob);
  }
  return workerSourceUrl;
}

export interface RunCodeCallbacks {
  onConsole(level: string, args: SerializedValue[]): void;
  onDone(): void;
  onError(error: SerializedError): void;
  onTimeout(): void;
  onStopped(): void;
}

export interface RunHandle {
  stop(): void;
}

export function runCode(source: string, callbacks: RunCodeCallbacks, timeoutMs = 10000): RunHandle {
  const runId = crypto.randomUUID();
  const worker = new Worker(getWorkerSourceUrl(), { type: 'module' });
  let settled = false;

  const hardTimeout = setTimeout(() => {
    settled = true;
    worker.terminate();
    callbacks.onTimeout();
  }, timeoutMs);

  worker.onmessage = (event: MessageEvent<WorkerToMainMessage>) => {
    const message = event.data;
    if (settled || message.runId !== runId) return;

    if (message.type === 'console') {
      callbacks.onConsole(message.level, message.args);
      return;
    }

    settled = true;
    clearTimeout(hardTimeout);
    worker.terminate();

    if (message.type === 'done') {
      callbacks.onDone();
    } else {
      callbacks.onError(message.error);
    }
  };

  worker.postMessage({ type: 'run', runId, source, timeoutMs });

  return {
    stop() {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimeout);
      worker.terminate();
      callbacks.onStopped();
    },
  };
}
```

- [ ] **Step 4: Write the barrel export**

`packages/core/src/runner/index.ts`:
```ts
export { runCode } from './run-code';
export type { RunCodeCallbacks, RunHandle } from './run-code';
export type {
  SerializedValue,
  SerializedError,
  RunMessage,
  ConsoleMessage,
  DoneMessage,
  ErrorMessage,
  MainToWorkerMessage,
  WorkerToMainMessage,
} from './protocol';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test run-code`
Expected: PASS, 5 tests.

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: all test files PASS (smoke, serialize-value, worker-source, run-code).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/runner/run-code.ts packages/core/src/runner/index.ts packages/core/src/runner/run-code.browser.test.ts
git commit -m "feat: add public runCode() API"
```
