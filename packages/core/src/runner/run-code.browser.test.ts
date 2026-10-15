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
