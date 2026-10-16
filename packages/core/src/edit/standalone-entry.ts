import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import javascript from 'shiki/langs/javascript.mjs';
import typescript from 'shiki/langs/typescript.mjs';
import githubLight from 'shiki/themes/github-light.mjs';
import githubDark from 'shiki/themes/github-dark.mjs';
import { spliceHighlightedHtml } from './splice.ts';
import type { HighlighterCore } from 'shiki/core';

const SUPPORTED_LANGS = new Set(['javascript', 'typescript']);
const SUPPORTED_THEMES = new Set(['github-light', 'github-dark']);

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      engine: createJavaScriptRegexEngine(),
      langs: [javascript, typescript],
      themes: [githubLight, githubDark],
    });
  }
  return highlighterPromise;
}

export async function highlightInto(pre: HTMLElement, code: string): Promise<void> {
  const lang = pre.dataset.ugokuLang ?? '';
  const singleTheme = pre.dataset.ugokuTheme;
  const lightTheme = pre.dataset.ugokuThemeLight;
  const darkTheme = pre.dataset.ugokuThemeDark;
  const themeNames = singleTheme ? [singleTheme] : [lightTheme, darkTheme].filter((t): t is string => !!t);

  const unsupported =
    !SUPPORTED_LANGS.has(lang) || themeNames.length === 0 || !themeNames.every((t) => SUPPORTED_THEMES.has(t));
  if (unsupported) return;

  const highlighter = await getHighlighter();
  // See editor.ts: defaultColor: false matches VitePress's own shiki output
  // format (--shiki-light/--shiki-dark only, no baseline inline `color`),
  // which its non-!important dark-mode CSS rule depends on.
  const html = singleTheme
    ? highlighter.codeToHtml(code, { lang, theme: singleTheme })
    : highlighter.codeToHtml(code, {
        lang,
        themes: { light: lightTheme!, dark: darkTheme! },
        defaultColor: false,
      });

  spliceHighlightedHtml(pre, html);
}
