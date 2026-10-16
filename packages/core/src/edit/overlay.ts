export function createOverlay(pre: HTMLElement): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.className = 'ugoku-edit-overlay';
  textarea.spellcheck = false;
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('autocapitalize', 'off');
  pre.appendChild(textarea);
  return textarea;
}
