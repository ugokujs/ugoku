import { mount, unmount } from '@ugoku/core';

mount(document.body);

document.addEventListener('astro:page-load', () => {
  mount(document.body);
});

document.addEventListener('astro:before-swap', () => {
  unmount(document.body);
});
