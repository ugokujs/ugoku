export function spliceHighlightedHtml(pre: HTMLElement, freshHtml: string): void {
  const container = document.createElement('div');
  container.innerHTML = freshHtml;
  const freshPre = container.firstElementChild as HTMLElement | null;
  const freshCode = freshPre?.querySelector('code');
  const codeEl = pre.querySelector('code');
  if (!freshPre || !freshCode || !codeEl) return;

  // Union rather than replace: hosts (e.g. VitePress's `vp-code`) add classes
  // of their own to the build-time <pre> that shiki's raw output doesn't know
  // about. Dropping them here can break host CSS that depends on them (e.g.
  // VitePress's dark-mode span-color rule is scoped to `.vp-code span`).
  const mergedClasses = new Set(pre.className.split(/\s+/).filter(Boolean));
  freshPre.className
    .split(/\s+/)
    .filter(Boolean)
    .forEach((c) => mergedClasses.add(c));
  pre.className = Array.from(mergedClasses).join(' ');
  const style = freshPre.getAttribute('style');
  if (style) {
    pre.setAttribute('style', style);
  } else {
    pre.removeAttribute('style');
  }

  codeEl.innerHTML = freshCode.innerHTML;
}
