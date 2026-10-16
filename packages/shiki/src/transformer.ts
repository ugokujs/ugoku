import type { ShikiTransformer } from 'shiki';
import { resolveMode } from './mode';
import { hashSource } from './hash';

export function ugokuTransformer(): ShikiTransformer {
  return {
    name: 'ugoku',
    pre(hast) {
      const mode = resolveMode(this.options.meta?.__raw);
      if (!mode) return;

      hast.properties['data-ugoku-mode'] = mode;
      hast.properties['data-ugoku-lang'] = this.options.lang;
      hast.properties['data-ugoku-hash'] = hashSource(this.source);

      // theme/themes can technically hold a full registration object, not just
      // a name — but every real config (VitePress included) references themes
      // by their string name.
      if ('theme' in this.options && this.options.theme) {
        hast.properties['data-ugoku-theme'] = this.options.theme as string;
      } else if ('themes' in this.options && this.options.themes) {
        const { light, dark } = this.options.themes as Record<string, string>;
        if (light) hast.properties['data-ugoku-theme-light'] = light;
        if (dark) hast.properties['data-ugoku-theme-dark'] = dark;
      }
    },
  };
}
