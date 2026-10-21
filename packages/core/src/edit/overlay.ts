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
}
