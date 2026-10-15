import { expect, test } from 'vitest';
import { OutputPanel } from './output-panel';

function mountWithFixedHeight(panel: OutputPanel): () => void {
  panel.element.style.height = '100px';
  panel.element.style.overflow = 'auto';
  document.body.appendChild(panel.element);
  return () => document.body.removeChild(panel.element);
}

test('appends a console message as a line with a level class', () => {
  const panel = new OutputPanel();
  panel.appendConsole({ level: 'log', args: [{ kind: 'primitive', value: 'hi' }] });
  const line = panel.element.querySelector('.ugoku-line-log');
  expect(line?.textContent).toBe('"hi"');
});

test('appends a run error with a banner and stack trace', () => {
  const panel = new OutputPanel();
  panel.appendError({ name: 'Error', message: 'boom', stack: 'Error: boom\n at x' });
  const line = panel.element.querySelector('.ugoku-line-run-error');
  expect(line?.querySelector('.ugoku-run-error-banner')?.textContent).toBe('run failed');
  expect(line?.querySelector('.ugoku-error-header')?.textContent).toBe('Error: boom');
});

test('auto-scrolls to the bottom as lines are appended while already at the bottom', () => {
  const panel = new OutputPanel();
  const cleanup = mountWithFixedHeight(panel);

  for (let i = 0; i < 20; i++) {
    panel.appendConsole({ level: 'log', args: [{ kind: 'primitive', value: `line ${i}` }] });
  }

  expect(panel.element.scrollTop).toBeGreaterThan(0);
  expect(panel.element.scrollHeight - panel.element.scrollTop - panel.element.clientHeight).toBeLessThanOrEqual(4);

  cleanup();
});

test('stops auto-scrolling once the reader scrolls away from the bottom', () => {
  const panel = new OutputPanel();
  const cleanup = mountWithFixedHeight(panel);

  for (let i = 0; i < 20; i++) {
    panel.appendConsole({ level: 'log', args: [{ kind: 'primitive', value: `line ${i}` }] });
  }

  panel.element.scrollTop = 0;

  for (let i = 20; i < 40; i++) {
    panel.appendConsole({ level: 'log', args: [{ kind: 'primitive', value: `line ${i}` }] });
  }

  expect(panel.element.scrollTop).toBe(0);

  cleanup();
});

test('clear() removes all previously appended lines', () => {
  const panel = new OutputPanel();
  panel.appendConsole({ level: 'log', args: [{ kind: 'primitive', value: 'first' }] });
  panel.appendConsole({ level: 'log', args: [{ kind: 'primitive', value: 'second' }] });
  expect(panel.element.children.length).toBe(2);

  panel.clear();

  expect(panel.element.children.length).toBe(0);
  expect(panel.element.textContent).toBe('');
});
