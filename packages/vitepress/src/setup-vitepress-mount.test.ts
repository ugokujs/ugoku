import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as core from '@ugoku/core';
import { setupVitePressMount } from './setup-vitepress-mount';

interface FakeDocument {
  body: object;
  querySelector: (selector: string) => object | null;
}

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
    delete (globalThis as { document?: unknown }).document;
    delete (globalThis as { MutationObserver?: unknown }).MutationObserver;
  });

  // The content-already-present case (the common path once VitePress has
  // finished its initial render) — querySelector finds a match immediately,
  // so setupVitePressMount can mount synchronously without touching
  // MutationObserver at all.
  function stubReadyDocument(): FakeDocument {
    const fakeDocument: FakeDocument = { body: {}, querySelector: () => ({}) };
    (globalThis as { document?: FakeDocument }).document = fakeDocument;
    return fakeDocument;
  }

  it('is a no-op when document is undefined (Node environment)', () => {
    expect(typeof document).toBe('undefined');

    const router = {};
    setupVitePressMount(router);

    expect(mountSpy).not.toHaveBeenCalled();
    expect(unmountSpy).not.toHaveBeenCalled();
  });

  it('mounts immediately when the content is already in the DOM at setup time', () => {
    const fakeDocument = stubReadyDocument();

    const router = {};
    setupVitePressMount(router);

    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(mountSpy).toHaveBeenCalledWith(fakeDocument.body);
  });

  it('waits for content to appear before mounting, when not yet rendered at setup time', () => {
    // Reproduces VitePress's real bootstrap order: enhanceApp() runs before
    // the Vue app has mounted into the DOM, so querySelector finds nothing
    // on the first check. setupVitePressMount must not mount until content
    // actually appears (observed via MutationObserver), not call mount()
    // blindly against an empty document.
    let observedCallback: MutationCallback | undefined;
    const fakeDocument: FakeDocument = {
      body: {},
      querySelector: vi.fn().mockReturnValueOnce(null).mockReturnValue({}),
    };
    (globalThis as { document?: FakeDocument }).document = fakeDocument;
    (globalThis as { MutationObserver?: unknown }).MutationObserver = class {
      constructor(callback: MutationCallback) {
        observedCallback = callback;
      }
      observe(): void {}
      disconnect(): void {}
    };

    const router = {};
    setupVitePressMount(router);

    expect(mountSpy).not.toHaveBeenCalled();

    observedCallback?.([], {} as MutationObserver);

    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(mountSpy).toHaveBeenCalledWith(fakeDocument.body);
  });

  it('disconnects the observer once content is found', () => {
    let observedCallback: MutationCallback | undefined;
    const disconnect = vi.fn();
    const fakeDocument: FakeDocument = {
      body: {},
      querySelector: vi.fn().mockReturnValueOnce(null).mockReturnValue({}),
    };
    (globalThis as { document?: FakeDocument }).document = fakeDocument;
    (globalThis as { MutationObserver?: unknown }).MutationObserver = class {
      constructor(callback: MutationCallback) {
        observedCallback = callback;
      }
      observe(): void {}
      disconnect(): void {
        disconnect();
      }
    };

    setupVitePressMount({});
    observedCallback?.([], {} as MutationObserver);

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(mountSpy).toHaveBeenCalledTimes(1);
  });

  it('unmounts on onBeforeRouteChange and mounts on onAfterRouteChange', async () => {
    stubReadyDocument();

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
  });

  it('preserves onBeforeRouteChange cancellation semantics when chaining', async () => {
    stubReadyDocument();

    const originalBefore = vi.fn().mockReturnValue(false);
    const router: {
      onBeforeRouteChange?: (to: string) => void | boolean | Promise<void | boolean>;
    } = { onBeforeRouteChange: originalBefore };
    setupVitePressMount(router);

    const result = await router.onBeforeRouteChange?.('/next-page');

    expect(unmountSpy).not.toHaveBeenCalled();
    expect(originalBefore).toHaveBeenCalledWith('/next-page');
    expect(result).toBe(false);
  });

  it('does not leave the page unmounted after a cancelled navigation', async () => {
    stubReadyDocument();

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
  });

  it('chains both existing hooks without clobbering them', async () => {
    stubReadyDocument();

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
  });
});
