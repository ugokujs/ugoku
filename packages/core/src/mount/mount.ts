import { runCode } from '../runner/run-code.ts';
import type { RunHandle } from '../runner/run-code.ts';
import { OutputPanel } from '../output-panel/output-panel.ts';
import type { ConsoleMessage, SerializedError } from '../runner/protocol.ts';
import { createOverlay, syncOverlayFallbacks } from '../edit/overlay.ts';
import { loadSavedEdit, saveEdit, clearSavedEdit } from '../edit/persistence.ts';
import { normalizeLang } from '../lang.ts';

const activeRuns = new WeakMap<HTMLElement, RunHandle>();
const SAVE_DEBOUNCE_MS = 400;

let tsChunkPromise: Promise<typeof import('../ts/strip.ts')> | null = null;

function loadTsChunk(): Promise<typeof import('../ts/strip.ts')> {
  if (!tsChunkPromise) {
    tsChunkPromise = import('../ts/strip.ts');
  }
  return tsChunkPromise;
}

function toSerializedError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { name: 'Error', message: String(error) };
}

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
  const isTypeScript = normalizeLang(pre.dataset.ugokuLang) === 'typescript';

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

  let stopRequestedBeforeRun = false;

  function startRun(code: string): void {
    const handle = runCode(code, {
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
  }

  async function handleRunClick(): Promise<void> {
    panel.clear();
    panel.element.hidden = true;
    setRunning(true);

    let codeToRun = getCurrentSource();

    if (isTypeScript) {
      let mod: typeof import('../ts/strip.ts');
      try {
        mod = await loadTsChunk();
      } catch {
        if (stopRequestedBeforeRun) {
          stopRequestedBeforeRun = false;
          return;
        }
        panel.element.hidden = false;
        panel.appendConsole({
          level: 'warn',
          args: [
            {
              kind: 'primitive',
              value:
                'ugoku: TypeScript execution unavailable for this block — could not load the type-stripping module.',
            },
          ],
        });
        finish();
        return;
      }

      if (stopRequestedBeforeRun) {
        stopRequestedBeforeRun = false;
        return;
      }

      try {
        codeToRun = mod.stripTypes(codeToRun);
      } catch (error) {
        panel.element.hidden = false;
        panel.appendError(toSerializedError(error));
        finish();
        return;
      }

      if (stopRequestedBeforeRun) {
        stopRequestedBeforeRun = false;
        return;
      }
    }

    startRun(codeToRun);
  }

  runBtn.addEventListener('click', () => {
    void handleRunClick();
  });

  stopBtn.addEventListener('click', () => {
    const handle = activeRuns.get(pre);
    if (handle) {
      handle.stop();
      return;
    }
    // No worker exists yet - the TypeScript strip chunk is still loading, or
    // stripping itself hasn't finished. Cancel the pending run instead of
    // waiting for it.
    if (!stopBtn.disabled) {
      stopRequestedBeforeRun = true;
      finish();
    }
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
  syncOverlayFallbacks(pre, overlay);
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
  } else {
    // Pre-fill with the original source so focusing the (now opaque)
    // overlay reveals editable text in place, not a blank box.
    overlay.value = source;
  }

  overlay.addEventListener('focus', () => {
    syncOverlayFallbacks(pre, overlay);
    void loadEditChunk();
  });

  overlay.addEventListener('input', () => {
    hasBeenEdited = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      saveEdit(hash, overlay.value);
      void rehighlight(overlay.value);
    }, SAVE_DEBOUNCE_MS);
  });

  overlay.addEventListener('blur', () => {
    // The overlay goes transparent on blur, revealing the highlighted code
    // underneath — flush any pending debounced save so that reveal isn't
    // stale for the rest of the debounce window.
    if (saveTimer !== undefined) {
      clearTimeout(saveTimer);
      saveTimer = undefined;
      saveEdit(hash, overlay.value);
      void rehighlight(overlay.value);
    }
  });

  const resetBtn = document.createElement('button');
  resetBtn.className = 'ugoku-reset-btn';
  resetBtn.textContent = 'Reset';
  resetBtn.addEventListener('click', () => {
    clearTimeout(saveTimer);
    saveTimer = undefined;
    clearSavedEdit(hash);
    overlay.value = source;
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
