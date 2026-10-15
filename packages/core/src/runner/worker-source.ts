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
