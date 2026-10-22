import { mount, unmount } from '@ugoku/core';
import stylesUrl from '@ugoku/core/styles.css?url';

function ensureStyles() {
  if (document.head.querySelector('link[data-ugoku-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = stylesUrl;
  link.dataset.ugokuStyles = 'true';
  document.head.appendChild(link);
}

ensureStyles();
mount(document.body);

document.addEventListener('astro:page-load', () => {
  ensureStyles();
  mount(document.body);
});

document.addEventListener('astro:before-swap', () => {
  unmount(document.body);
});
