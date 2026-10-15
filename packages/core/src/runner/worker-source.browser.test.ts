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
