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

test('posts error, not done, for an exception thrown inside a setTimeout callback', async () => {
  const worker = createTestWorker();
  const messages: unknown[] = [];

  await new Promise<void>((resolve) => {
    worker.onmessage = (event) => {
      messages.push(event.data);
      resolve();
    };
    worker.postMessage({
      type: 'run',
      runId: 'test-4',
      source: `setTimeout(() => { throw new Error('late boom'); }, 20)`,
      timeoutMs: 1000,
    });
  });

  await new Promise((resolve) => setTimeout(resolve, 50));
  worker.terminate();

  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatchObject({
    type: 'error',
    runId: 'test-4',
    error: { message: 'late boom' },
  });
});

test('serializes non-primitive console args using the real serializer', async () => {
  const worker = createTestWorker();
  const messages: unknown[] = [];

  await new Promise<void>((resolve) => {
    worker.onmessage = (event) => {
      messages.push(event.data);
      if ((event.data as { type: string }).type === 'done') resolve();
    };
    worker.postMessage({
      type: 'run',
      runId: 'test-5',
      source: `console.log({ a: 1 }, [1, 2])`,
      timeoutMs: 1000,
    });
  });

  worker.terminate();
  expect(messages).toEqual([
    {
      type: 'console',
      runId: 'test-5',
      level: 'log',
      args: [
        {
          kind: 'object',
          preview: '{ a: 1 }',
          className: null,
          entries: [{ key: 'a', value: { kind: 'primitive', value: 1 } }],
          omittedCount: 0,
        },
        {
          kind: 'array',
          preview: '[ 1, 2 ]',
          items: [
            { kind: 'primitive', value: 1 },
            { kind: 'primitive', value: 2 },
          ],
          omittedCount: 0,
        },
      ],
    },
    { type: 'done', runId: 'test-5' },
  ]);
});
