import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from '@ugoku/core';
import { setupVitePressMount } from './setup-vitepress-mount';

describe('setupVitePressMount', () => {
  let mountSpy: ReturnType<typeof vi.spyOn>;
  let unmountSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mountSpy = vi.spyOn(core, 'mount').mockImplementation(() => {});
    unmountSpy = vi.spyOn(core, 'unmount').mockImplementation(() => {});
  });

  afterEach(() => {
    mountSpy.mockRestore();
    unmountSpy.mockRestore();
  });

  it('is a no-op when document is undefined (Node environment)', () => {
    expect(typeof document).toBe('undefined');

    const router = {};
    setupVitePressMount(router);

    expect(mountSpy).not.toHaveBeenCalled();
    expect(unmountSpy).not.toHaveBeenCalled();
  });

  it('mounts immediately when document exists', () => {
    (globalThis as { document?: object }).document = { body: {} };

    const router = {};
    setupVitePressMount(router);

    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(mountSpy).toHaveBeenCalledWith((globalThis as { document: { body: object } }).document.body);

    delete (globalThis as { document?: object }).document;
  });

  it('unmounts on onBeforeRouteChange and mounts on onAfterRouteChange', async () => {
    (globalThis as { document?: object }).document = { body: {} };

    const router: {
      onBeforeRouteChange?: (to: string) => void | boolean | Promise<void | boolean>;
      onAfterRouteChange?: (to: string) => void | Promise<void>;
    } = {};
    setupVitePressMount(router);
    mountSpy.mockClear();

    await router.onBeforeRouteChange?.('/next-page');
    expect(unmountSpy).toHaveBeenCalledTimes(1);
    expect(mountSpy).not.toHaveBeenCalled();

    await router.onAfterRouteChange?.('/next-page');
    expect(mountSpy).toHaveBeenCalledTimes(1);

    delete (globalThis as { document?: object }).document;
  });

  it('preserves onBeforeRouteChange cancellation semantics when chaining', async () => {
    (globalThis as { document?: object }).document = { body: {} };

    const originalBefore = vi.fn().mockReturnValue(false);
    const router: {
      onBeforeRouteChange?: (to: string) => void | boolean | Promise<void | boolean>;
    } = { onBeforeRouteChange: originalBefore };
    setupVitePressMount(router);

    const result = await router.onBeforeRouteChange?.('/next-page');

    expect(unmountSpy).not.toHaveBeenCalled();
    expect(originalBefore).toHaveBeenCalledWith('/next-page');
    expect(result).toBe(false);

    delete (globalThis as { document?: object }).document;
  });

  it('does not leave the page unmounted after a cancelled navigation', async () => {
    (globalThis as { document?: object }).document = { body: {} };

    const originalBefore = vi.fn().mockReturnValue(false);
    const router: {
      onBeforeRouteChange?: (to: string) => void | boolean | Promise<void | boolean>;
    } = { onBeforeRouteChange: originalBefore };
    setupVitePressMount(router);
    mountSpy.mockClear();

    const result = await router.onBeforeRouteChange?.('/next-page');

    expect(result).toBe(false);
    expect(unmountSpy).not.toHaveBeenCalled();
    expect(mountSpy).not.toHaveBeenCalled();

    delete (globalThis as { document?: object }).document;
  });

  it('chains both existing hooks without clobbering them', async () => {
    (globalThis as { document?: object }).document = { body: {} };

    const originalBefore = vi.fn();
    const originalAfter = vi.fn();
    const router: {
      onBeforeRouteChange?: (to: string) => void | boolean | Promise<void | boolean>;
      onAfterRouteChange?: (to: string) => void | Promise<void>;
    } = { onBeforeRouteChange: originalBefore, onAfterRouteChange: originalAfter };
    setupVitePressMount(router);

    await router.onBeforeRouteChange?.('/next-page');
    await router.onAfterRouteChange?.('/next-page');

    expect(originalBefore).toHaveBeenCalledWith('/next-page');
    expect(originalAfter).toHaveBeenCalledWith('/next-page');

    delete (globalThis as { document?: object }).document;
  });
});
