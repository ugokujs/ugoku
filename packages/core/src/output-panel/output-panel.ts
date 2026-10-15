import { renderValue } from './render-value';
import type { ConsoleMessage, SerializedError } from '../runner/protocol';

export class OutputPanel {
  readonly element: HTMLElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'ugoku-output-panel';
  }

  appendConsole(message: Pick<ConsoleMessage, 'level' | 'args'>): void {
    const line = document.createElement('div');
    line.className = `ugoku-line ugoku-line-${message.level}`;
    message.args.forEach((arg, index) => {
      if (index > 0) line.append(' ');
      line.appendChild(renderValue(arg));
    });
    this.appendLine(line);
  }

  appendError(error: SerializedError): void {
    const line = document.createElement('div');
    line.className = 'ugoku-line ugoku-line-run-error';

    const banner = document.createElement('span');
    banner.className = 'ugoku-run-error-banner';
    banner.textContent = 'run failed';
    line.appendChild(banner);

    line.appendChild(
      renderValue({ kind: 'error', name: error.name, message: error.message, stack: error.stack }),
    );
    this.appendLine(line);
  }

  private appendLine(line: HTMLElement): void {
    const wasAtBottom = this.isAtBottom();
    this.element.appendChild(line);
    if (wasAtBottom) this.scrollToBottom();
  }

  private isAtBottom(): boolean {
    const threshold = 4;
    return this.element.scrollHeight - this.element.scrollTop - this.element.clientHeight <= threshold;
  }

  private scrollToBottom(): void {
    this.element.scrollTop = this.element.scrollHeight;
  }
}
