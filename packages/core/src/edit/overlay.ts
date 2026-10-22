export function createOverlay(pre: HTMLElement): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.className = 'ugoku-edit-overlay';
  textarea.spellcheck = false;
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('autocapitalize', 'off');
  pre.appendChild(textarea);
  return textarea;
}

export function syncOverlayFallbacks(pre: HTMLElement, overlay: HTMLTextAreaElement): void {
  const codeEl = pre.querySelector('code') ?? pre;
  const codeStyle = getComputedStyle(codeEl);
  overlay.style.setProperty('--ugoku-font-edit-family', codeStyle.fontFamily);
  overlay.style.setProperty('--ugoku-font-edit-size', codeStyle.fontSize);
  overlay.style.setProperty('--ugoku-font-edit-line-height', codeStyle.lineHeight);

  const preStyle = getComputedStyle(pre);
  overlay.style.setProperty('--ugoku-color-edit-bg', preStyle.backgroundColor);
  overlay.style.setProperty('--ugoku-color-edit-text', preStyle.color);

  // Some hosts (e.g. VitePress) split a code block's padding between <pre>
  // and <code> rather than putting it all on one element. Summing both
  // sides here reproduces the real text inset regardless of how a host
  // divides it, instead of guessing a single fixed value.
  const sumPx = (a: string, b: string) => `${parseFloat(a) + parseFloat(b)}px`;
  overlay.style.setProperty('--ugoku-padding-edit-top', sumPx(preStyle.paddingTop, codeStyle.paddingTop));
  overlay.style.setProperty('--ugoku-padding-edit-right', sumPx(preStyle.paddingRight, codeStyle.paddingRight));
  overlay.style.setProperty(
    '--ugoku-padding-edit-bottom',
    sumPx(preStyle.paddingBottom, codeStyle.paddingBottom),
  );
  overlay.style.setProperty('--ugoku-padding-edit-left', sumPx(preStyle.paddingLeft, codeStyle.paddingLeft));
}
