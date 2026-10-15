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

test('mounts a "run-edit" pre identically to "run"', () => {
  const pre = createPre('run-edit', 'console.log(1)');
  mount(document.body);

  const controls = pre.nextElementSibling as HTMLElement;
  expect(controls.className).toBe('ugoku-controls');

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
