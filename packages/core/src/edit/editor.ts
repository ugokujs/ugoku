import { ensureLoaded } from './highlighter-cache.ts';
import { spliceHighlightedHtml } from './splice.ts';

export async function highlightInto(pre: HTMLElement, code: string): Promise<void> {
  const lang = pre.dataset.ugokuLang ?? '';
  const singleTheme = pre.dataset.ugokuTheme;
  const lightTheme = pre.dataset.ugokuThemeLight;
  const darkTheme = pre.dataset.ugokuThemeDark;

  const themeNames = singleTheme ? [singleTheme] : [lightTheme, darkTheme].filter((t): t is string => !!t);
  if (themeNames.length === 0) return;

  const highlighter = await ensureLoaded(lang, themeNames);

  // defaultColor: false matches VitePress's own shiki output: spans carry only
  // --shiki-light/--shiki-dark custom properties, no baseline inline `color`.
  // VitePress's CSS (.dark .vp-code span { color: var(--shiki-dark) }) has no
  // !important, so a plain inline `color` (shiki's default) would always win
  // and the block would stay stuck on the light theme after any rehighlight.
  const html = singleTheme
    ? highlighter.codeToHtml(code, { lang, theme: singleTheme })
    : highlighter.codeToHtml(code, {
        lang,
        themes: { light: lightTheme!, dark: darkTheme! },
        defaultColor: false,
      });

  spliceHighlightedHtml(pre, html);
}
