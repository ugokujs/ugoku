import { describe, expect, it, vi } from 'vitest';
import type { AstroIntegration } from 'astro';
import { ugoku } from './integration';

type SetupHookArgs = Pick<
  Parameters<NonNullable<AstroIntegration['hooks']['astro:config:setup']>>[0],
  'updateConfig' | 'injectScript'
>;

function runSetupHook(integration: AstroIntegration, args: SetupHookArgs): void {
  const setup = integration.hooks['astro:config:setup'];
  if (!setup) throw new Error('astro:config:setup hook is missing');
  setup(args as Parameters<NonNullable<AstroIntegration['hooks']['astro:config:setup']>>[0]);
}

describe('ugoku (Astro integration)', () => {
  it('has the expected integration name', () => {
    expect(ugoku().name).toBe('@ugoku/astro');
  });

  it('registers the ugoku Shiki transformer in markdown.shikiConfig.transformers', () => {
    const updateConfig = vi.fn();
    const injectScript = vi.fn();

    runSetupHook(ugoku(), { updateConfig, injectScript });

    expect(updateConfig).toHaveBeenCalledTimes(1);
    const [config] = updateConfig.mock.calls[0];
    const transformers = config.markdown.shikiConfig.transformers;
    expect(transformers).toHaveLength(1);
    expect(transformers[0].name).toBe('ugoku');
  });

  it('injects the client mount script at the page stage', () => {
    const updateConfig = vi.fn();
    const injectScript = vi.fn();

    runSetupHook(ugoku(), { updateConfig, injectScript });

    expect(injectScript).toHaveBeenCalledWith('page', expect.stringContaining('@ugoku/astro/client'));
  });
});
