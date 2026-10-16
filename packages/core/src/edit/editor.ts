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

  const html = singleTheme
    ? highlighter.codeToHtml(code, { lang, theme: singleTheme })
    : highlighter.codeToHtml(code, { lang, themes: { light: lightTheme!, dark: darkTheme! } });

  spliceHighlightedHtml(pre, html);
}
