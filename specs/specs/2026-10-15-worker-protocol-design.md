# Worker ↔ main-thread protocol

Date: 2026-10-15

## Purpose

Define the message protocol and execution model between the main thread (UI: Run/Stop buttons, output panel) and the module Web Worker that executes a runnable code block. This is the core runtime contract for `@ugoku/core`'s runner, independent of the console serializer's display format and the Shiki transformer's build-time output.

## Message envelope

A discriminated union over `postMessage`, tagged with a `runId` (fresh UUID per Run click) so the main thread can ignore stale messages from a worker it has already terminated.

### Main → worker

Sent once, immediately after the worker is constructed:

```ts
{ type: 'run', runId: string, source: string, timeoutMs: number }
```

There is no `stop` message. Stop is implemented as the main thread calling `worker.terminate()` directly — a hung synchronous loop can't be expected to receive or act on a message.

### Worker → main

```ts
{ type: 'console', runId: string, level: 'log' | 'warn' | 'error' | 'info' | 'debug', args: SerializedValue[] }
{ type: 'done', runId: string }
{ type: 'error', runId: string, error: { name: string, message: string, stack?: string } }
```

`SerializedValue` is an opaque placeholder for this spec:

```ts
type SerializedValue =
  | { kind: 'primitive', value: string | number | boolean | null | undefined }
  | { kind: 'placeholder', preview: string } // String(x) fallback
```

The console-serializer spec (separate, future) replaces this type with a real `util.inspect`-style display tree. The message shape (`console` message carrying a `SerializedValue[]`) does not change — only the type's internals do.

## Execution model

On Run, the main thread:
1. Generates `runId`.
2. Creates `new Worker(runnerBlobURL, { type: 'module' })`, where `runnerBlobURL` is a **fixed, static bootstrap script** built once at `@ugoku/core` module-load time and reused as a Blob URL across every run (not regenerated per run).
3. Starts a hard-timeout timer: `setTimeout(() => { worker.terminate(); /* show "Timed out" */ }, timeoutMs)`.
4. Sends the `run` message.

The bootstrap script, on receiving `run`:
1. Proxies `console.log/warn/error/info/debug` to post `console` messages back, serializing each argument via the placeholder `SerializedValue` stub.
2. Overrides `setTimeout`/`setInterval`/`clearTimeout`/`clearInterval` to maintain a `pendingTimers` counter (incremented on set, decremented on fire-once/clear; `setInterval` callbacks that never clear keep the counter above zero indefinitely).
3. Wraps `source` in its own Blob (`type: 'text/javascript'`) and does `await import(URL.createObjectURL(userBlob))`. A fresh object URL per run gives top-level await, a clean module scope, and avoids the dynamic-import module cache colliding across runs of the same block.
4. On the import settling:
   - Rejected → `postMessage({ type: 'error', runId, error })` immediately, regardless of `pendingTimers`. An uncaught top-level exception ends the run.
   - Resolved → if `pendingTimers === 0`, post `done` immediately; otherwise wait for the counter to reach zero, then post `done`.

This means a run with a `setTimeout` chain that outlives the top-level script keeps streaming output and only reports `done` once all pending timers have fired or been cleared. A never-cleared `setInterval` never reaches `done` on its own — it relies on the hard timeout or Stop, which is correct: that case is genuinely unbounded.

## Timeout & Stop UX

Default `timeoutMs`: **10 seconds**, hardcoded in `@ugoku/core` for v0. Not configurable via fence meta yet — no syntax for it exists in the roadmap, and it's a non-breaking addition later since `timeoutMs` is already a field on the `run` message.

This is also the only recourse for a synchronous infinite loop (e.g. `while (true) {}`): it blocks the worker thread entirely, so no message can ever be posted, and the hard timeout is what eventually kills it.

Hard timeout and Stop share one code path (`worker.terminate()` + a synthetic main-thread-only UI state) but render distinct labels:
- Hard timeout fires → "Timed out after 10s"
- Reader clicks Stop → "Stopped"

Neither is a worker→main message — the worker is terminated from outside and never gets a chance to report anything.

## Error handling

Two structurally distinct failure paths:

- **In-worker errors** (thrown during execution, including a `SyntaxError` from a malformed user module): caught by the bootstrap's `try/catch` around `await import(...)`, posted as `{ type: 'error', runId, error: { name, message, stack } }`. Extracted as plain strings rather than passing the `Error` instance through `postMessage`, because custom `Error` subclasses lose their prototype chain across the structured-clone boundary, and `stack` would otherwise reference worker-internal blob URLs meaningless to the reader.
- **External failures** (hard timeout, Stop): the synthetic main-thread-only states above. Never a worker message.

## Full lifecycle

```
Reader clicks Run
  main: runId = uuid()
  main: worker = new Worker(runnerBlobURL, { type: 'module' })
  main: hardTimeout = setTimeout(() => { terminate + show "Timed out" }, 10000)
  main: worker.postMessage({ type: 'run', runId, source, timeoutMs: 10000 })

  worker: sets up console proxy + timer tracking
  worker: userBlobURL = Blob(source) → await import(userBlobURL)
  worker: (console calls stream back as { type: 'console', ... } throughout)
  worker: import settles →
    if rejected → postMessage({ type: 'error', runId, error })
    if resolved → wait for pendingTimers === 0 → postMessage({ type: 'done', runId })

main (on any message): if msg.runId !== currentRunId → ignore (stale)
main (on 'done' / 'error'): clearTimeout(hardTimeout); worker.terminate(); update UI
main (on Stop click): clearTimeout(hardTimeout); worker.terminate(); show "Stopped"
```

## Worker lifecycle

Fresh worker per run: every Run click creates a new `Worker` and terminates it when the run finishes (naturally, on error, on timeout, or on Stop). No worker is reused across runs. This guarantees no leaked globals between runs and avoids bookkeeping for "is this worker idle vs mid-run."

## Out of scope

Deferred to their own specs or decisions:
- The real `SerializedValue` display-tree format (console serializer spec).
- Per-block timeout configuration syntax.
- The `@ugoku/shiki` transformer's data-attribute format.
- The edit-mode localStorage persistence protocol.
