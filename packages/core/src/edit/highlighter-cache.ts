import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages } from 'shiki/langs';
import { bundledThemes } from 'shiki/themes';
import { getLanguageLoader, getThemeLoader } from './loader-registry';
import type { HighlighterCore } from 'shiki/core';

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      engine: createJavaScriptRegexEngine(),
    });
  }
  return highlighterPromise;
}

export async function ensureLoaded(lang: string, themeNames: string[]): Promise<HighlighterCore> {
  const highlighter = await getHighlighter();

  if (!highlighter.getLoadedLanguages().includes(lang)) {
    if (lang in bundledLanguages) {
      await highlighter.loadLanguage(bundledLanguages[lang as keyof typeof bundledLanguages]());
    } else {
      const customLoader = getLanguageLoader(lang);
      if (!customLoader) {
        throw new Error(`ugoku: unsupported language "${lang}" for live re-highlighting`);
      }
      await highlighter.loadLanguage(customLoader());
    }
  }

  for (const theme of themeNames) {
    if (highlighter.getLoadedThemes().includes(theme)) continue;

    if (theme in bundledThemes) {
      await highlighter.loadTheme(bundledThemes[theme as keyof typeof bundledThemes]());
    } else {
      const customLoader = getThemeLoader(theme);
      if (!customLoader) {
        throw new Error(`ugoku: unsupported theme "${theme}" for live re-highlighting`);
      }
      await highlighter.loadTheme(customLoader());
    }
  }

  return highlighter;
}
