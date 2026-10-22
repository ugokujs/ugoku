import { mount, unmount } from '@ugoku/core';
import stylesUrl from '@ugoku/core/styles.css?url';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = stylesUrl;
document.head.appendChild(link);

mount(document.body);

document.addEventListener('astro:page-load', () => {
  mount(document.body);
});

document.addEventListener('astro:before-swap', () => {
  unmount(document.body);
});
