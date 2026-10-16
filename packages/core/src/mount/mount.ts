import { runCode } from '../runner/run-code.ts';
import type { RunHandle } from '../runner/run-code.ts';
import { OutputPanel } from '../output-panel/output-panel.ts';
import type { ConsoleMessage } from '../runner/protocol.ts';

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
    panel.element.hidden = true;
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

  // First call removes the controls div; .remove() shifts nextElementSibling
  // forward as a side effect, so the second call now removes the output panel.
  pre.nextElementSibling?.remove();
  pre.nextElementSibling?.remove();

  delete pre.dataset.ugokuMounted;
}
