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

test('mounts a "run-edit" pre with an extra Reset button and an edit overlay', () => {
  const pre = createPre('run-edit', 'console.log(1)');
  pre.dataset.ugokuHash = 'test-hash-1';
  mount(document.body);

  const controls = pre.nextElementSibling as HTMLElement;
  expect(controls.className).toBe('ugoku-controls');
  expect(controls.querySelector('.ugoku-reset-btn')).not.toBeNull();
  expect(pre.querySelector('.ugoku-edit-overlay')).not.toBeNull();

  unmount(document.body);
  pre.remove();
});

test('a "run-edit" overlay starts pre-filled with the original source when there is no saved edit', () => {
  const pre = createPre('run-edit', 'console.log("original")');
  pre.dataset.ugokuHash = 'test-hash-7';
  mount(document.body);

  const overlay = pre.querySelector('.ugoku-edit-overlay') as HTMLTextAreaElement;
  expect(overlay.value).toBe('console.log("original")');

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
  // Logs a fresh random value each run (rather than fixed text) because mount()
  // captures the pre's source once at mount time, so both clicks execute the
  // same string — a random value per execution is what makes the two runs'
  // output distinguishable without relying on a coincidental line count.
  const pre = createPre('run', 'console.log(crypto.randomUUID())');
  mount(document.body);

  const controls = pre.nextElementSibling as HTMLElement;
  const panel = controls.nextElementSibling as HTMLElement;
  const runBtn = controls.querySelector('.ugoku-run-btn') as HTMLButtonElement;

  runBtn.click();
  await vi.waitFor(() => expect(panel.querySelectorAll('.ugoku-line').length).toBe(1));
  const firstLine = panel.querySelector('.ugoku-line')?.textContent;

  // Guarantee the first run has actually finished (button re-enabled) before
  // clicking again — otherwise this click could be a no-op on a disabled
  // button and the assertions below would pass trivially against leftover
  // first-run output.
  await vi.waitFor(() => expect(runBtn.disabled).toBe(false));

  runBtn.click();
  await vi.waitFor(() => expect(panel.querySelectorAll('.ugoku-line').length).toBe(1));
  const secondLine = panel.querySelector('.ugoku-line')?.textContent;

  expect(secondLine).not.toBe(firstLine);

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

test('Run on a "run-edit" block executes the overlay value, not the original source', async () => {
  const pre = createPre('run-edit', 'console.log("original")');
  pre.dataset.ugokuHash = 'test-hash-2';
  mount(document.body);

  const overlay = pre.querySelector('.ugoku-edit-overlay') as HTMLTextAreaElement;
  overlay.value = 'console.log("edited")';
  overlay.dispatchEvent(new Event('input'));

  const controls = pre.nextElementSibling as HTMLElement;
  const panel = controls.nextElementSibling as HTMLElement;
  const runBtn = controls.querySelector('.ugoku-run-btn') as HTMLButtonElement;

  runBtn.click();
  await vi.waitFor(() => expect(panel.textContent).toContain('edited'));

  unmount(document.body);
  pre.remove();
});

test('Reset on a "run-edit" block restores the original pre markup and clears the overlay', () => {
  const pre = createPre('run-edit', 'console.log("original")');
  pre.className = 'shiki original-theme';
  pre.dataset.ugokuHash = 'test-hash-3';
  mount(document.body);

  const overlay = pre.querySelector('.ugoku-edit-overlay') as HTMLTextAreaElement;
  overlay.value = 'console.log("edited")';
  overlay.dispatchEvent(new Event('input'));

  const controls = pre.nextElementSibling as HTMLElement;
  const resetBtn = controls.querySelector('.ugoku-reset-btn') as HTMLButtonElement;
  resetBtn.click();

  expect(overlay.value).toBe('console.log("original")');
  expect(pre.className).toBe('shiki original-theme');

  unmount(document.body);
  pre.remove();
});

test('a saved edit is restored into the overlay and eagerly re-highlighted on mount', async () => {
  const pre = document.createElement('pre');
  pre.dataset.ugokuMode = 'run-edit';
  pre.dataset.ugokuHash = 'test-hash-4';
  pre.dataset.ugokuLang = 'javascript';
  pre.dataset.ugokuTheme = 'github-light';
  const code = document.createElement('code');
  code.textContent = 'console.log("original")';
  pre.appendChild(code);
  document.body.appendChild(pre);
  localStorage.setItem('ugoku:edit:test-hash-4', 'console.log("restored")');

  mount(document.body);

  const overlay = pre.querySelector('.ugoku-edit-overlay') as HTMLTextAreaElement;
  expect(overlay.value).toBe('console.log("restored")');
  await vi.waitFor(() => expect(pre.className).toContain('shiki'));
  expect(pre.querySelector('code')?.innerHTML).toContain('restored');

  unmount(document.body);
  localStorage.removeItem('ugoku:edit:test-hash-4');
  pre.remove();
});

test('focusing the overlay twice before editing does not break re-highlighting on later input', async () => {
  const pre = document.createElement('pre');
  pre.dataset.ugokuMode = 'run-edit';
  pre.dataset.ugokuHash = 'test-hash-6';
  pre.dataset.ugokuLang = 'javascript';
  pre.dataset.ugokuTheme = 'github-light';
  const code = document.createElement('code');
  code.textContent = 'console.log(1)';
  pre.appendChild(code);
  document.body.appendChild(pre);

  mount(document.body);

  const overlay = pre.querySelector('.ugoku-edit-overlay') as HTMLTextAreaElement;
  overlay.dispatchEvent(new Event('focus'));
  overlay.dispatchEvent(new Event('focus'));

  overlay.value = 'console.log(2)';
  overlay.dispatchEvent(new Event('input'));

  await vi.waitFor(() => expect(pre.querySelector('code')?.innerHTML).toContain('2'));

  unmount(document.body);
  pre.remove();
});

test('unmount followed by mount again does not leave a duplicate overlay', () => {
  const pre = createPre('run-edit', 'console.log(1)');
  pre.dataset.ugokuHash = 'test-hash-5';

  mount(document.body);
  unmount(document.body);
  mount(document.body);

  expect(pre.querySelectorAll('.ugoku-edit-overlay').length).toBe(1);

  unmount(document.body);
  pre.remove();
});

test('Run on a "run" block with ugokuLang "typescript" strips types before executing', async () => {
  const pre = createPre('run', 'const x: number = 1;\nconsole.log("stripped:", x);');
  pre.dataset.ugokuLang = 'typescript';
  mount(document.body);

  const controls = pre.nextElementSibling as HTMLElement;
  const panel = controls.nextElementSibling as HTMLElement;
  const runBtn = controls.querySelector('.ugoku-run-btn') as HTMLButtonElement;

  runBtn.click();
  await vi.waitFor(() => expect(panel.textContent).toContain('stripped:'));

  unmount(document.body);
  pre.remove();
});

test('Run on a "typescript" block with a genuine syntax error shows the error and never starts a worker', async () => {
  const pre = createPre('run', 'const x = ;');
  pre.dataset.ugokuLang = 'typescript';
  mount(document.body);

  const controls = pre.nextElementSibling as HTMLElement;
  const panel = controls.nextElementSibling as HTMLElement;
  const runBtn = controls.querySelector('.ugoku-run-btn') as HTMLButtonElement;
  const stopBtn = controls.querySelector('.ugoku-stop-btn') as HTMLButtonElement;

  runBtn.click();
  await vi.waitFor(() => expect(panel.hidden).toBe(false));

  expect(panel.textContent).toContain('run failed');
  expect(runBtn.disabled).toBe(false);
  expect(stopBtn.disabled).toBe(true);

  unmount(document.body);
  pre.remove();
});

test('clicking Stop while the TypeScript strip chunk is loading cancels the pending run without ever starting a worker', async () => {
  const pre = createPre('run', 'const x: number = 1;\nconsole.log("stripped:", x);');
  pre.dataset.ugokuLang = 'typescript';
  mount(document.body);

  const controls = pre.nextElementSibling as HTMLElement;
  const panel = controls.nextElementSibling as HTMLElement;
  const runBtn = controls.querySelector('.ugoku-run-btn') as HTMLButtonElement;
  const stopBtn = controls.querySelector('.ugoku-stop-btn') as HTMLButtonElement;

  const workerSpy = vi.spyOn(window, 'Worker');

  runBtn.click();
  expect(stopBtn.disabled).toBe(false);
  stopBtn.click();

  await new Promise((resolve) => setTimeout(resolve, 300));

  expect(workerSpy).not.toHaveBeenCalled();
  expect(runBtn.disabled).toBe(false);
  expect(stopBtn.disabled).toBe(true);
  expect(panel.textContent).toBe('');

  workerSpy.mockRestore();
  unmount(document.body);
  pre.remove();
});
