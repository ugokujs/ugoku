import { createWorkerSource } from './worker-source.ts';
import type { SerializedError, SerializedValue, WorkerToMainMessage } from './protocol.ts';

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
