export function spliceHighlightedHtml(pre: HTMLElement, freshHtml: string): void {
  const container = document.createElement('div');
  container.innerHTML = freshHtml;
  const freshPre = container.firstElementChild as HTMLElement | null;
  const freshCode = freshPre?.querySelector('code');
  const codeEl = pre.querySelector('code');
  if (!freshPre || !freshCode || !codeEl) return;

  pre.className = freshPre.className;
  const style = freshPre.getAttribute('style');
  if (style) {
    pre.setAttribute('style', style);
  } else {
    pre.removeAttribute('style');
  }

  codeEl.innerHTML = freshCode.innerHTML;
}
