import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// no static top-level import of '@ugoku/core' — must be dynamic, see beforeEach

interface FakeLink {
  rel: string;
  href: string;
  dataset: Record<string, string>;
}

interface FakeDocument {
  body: object;
  head: {
    querySelector: (selector: string) => FakeLink | null;
    appendChild: (node: FakeLink) => void;
  };
  createElement: (tag: string) => FakeLink;
  addEventListener: (type: string, listener: () => void) => void;
}

function stubDocument(): { fakeDocument: FakeDocument; listeners: Record<string, () => void> } {
  const listeners: Record<string, () => void> = {};
  let existingLink: FakeLink | null = null;
  const fakeDocument: FakeDocument = {
    body: {},
    head: {
      querySelector: (selector) => (selector === 'link[data-ugoku-styles]' ? existingLink : null),
      appendChild: (node) => {
        existingLink = node;
      },
    },
    createElement: () => ({ rel: '', href: '', dataset: {} }),
    addEventListener: (type, listener) => {
      listeners[type] = listener;
    },
  };
  (globalThis as { document?: FakeDocument }).document = fakeDocument;
  return { fakeDocument, listeners };
}

describe('@ugoku/astro client', () => {
  let mountSpy: ReturnType<typeof vi.spyOn>;
  let unmountSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    vi.resetModules();
    const core = await import('@ugoku/core');
    mountSpy = vi.spyOn(core, 'mount').mockImplementation(() => {});
    unmountSpy = vi.spyOn(core, 'unmount').mockImplementation(() => {});
  });

  afterEach(() => {
    mountSpy.mockRestore();
    unmountSpy.mockRestore();
    delete (globalThis as { document?: unknown }).document;
  });

  it('mounts synchronously when the module is imported', async () => {
    const { fakeDocument } = stubDocument();

    await import('./client');

    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(mountSpy).toHaveBeenCalledWith(fakeDocument.body);
  });

  it('mounts again when astro:page-load fires', async () => {
    const { fakeDocument, listeners } = stubDocument();
    await import('./client');
    mountSpy.mockClear();

    listeners['astro:page-load']?.();

    expect(mountSpy).toHaveBeenCalledTimes(1);
    expect(mountSpy).toHaveBeenCalledWith(fakeDocument.body);
  });

  it('unmounts when astro:before-swap fires', async () => {
    const { fakeDocument, listeners } = stubDocument();
    await import('./client');

    listeners['astro:before-swap']?.();

    expect(unmountSpy).toHaveBeenCalledTimes(1);
    expect(unmountSpy).toHaveBeenCalledWith(fakeDocument.body);
  });
});
