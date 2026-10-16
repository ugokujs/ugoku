import { mount, unmount } from '@ugoku/core';

interface VitePressRouterLike {
  onBeforeRouteChange?: (to: string) => void | boolean | Promise<void | boolean>;
  onAfterRouteChange?: (to: string) => void | Promise<void>;
}

export function setupVitePressMount(router: VitePressRouterLike): void {
  if (typeof document === 'undefined') return;

  const originalBefore = router.onBeforeRouteChange;
  const originalAfter = router.onAfterRouteChange;

  router.onBeforeRouteChange = async (to) => {
    const result = originalBefore ? await originalBefore(to) : undefined;
    if (result === false) return false;
    unmount(document.body);
    return result;
  };

  router.onAfterRouteChange = async (to) => {
    mount(document.body);
    if (originalAfter) return originalAfter(to);
  };

  // `enhanceApp` runs before VitePress's Vue app actually mounts into the
  // DOM, so document.body is still empty at this point. Wait for the
  // initial render instead of mounting synchronously here.
  if (document.querySelector('pre[data-ugoku-mode]')) {
    mount(document.body);
    return;
  }
  const observer = new MutationObserver(() => {
    if (document.querySelector('pre[data-ugoku-mode]')) {
      observer.disconnect();
      mount(document.body);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}
