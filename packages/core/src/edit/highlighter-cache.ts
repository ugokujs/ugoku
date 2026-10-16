import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { bundledLanguages } from 'shiki/langs';
import { bundledThemes } from 'shiki/themes';
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
  if (!(lang in bundledLanguages)) {
    throw new Error(`ugoku: unsupported language "${lang}" for live re-highlighting`);
  }

  const highlighter = await getHighlighter();

  if (!highlighter.getLoadedLanguages().includes(lang)) {
    await highlighter.loadLanguage(bundledLanguages[lang as keyof typeof bundledLanguages]());
  }

  for (const theme of themeNames) {
    if (!(theme in bundledThemes)) {
      throw new Error(`ugoku: unsupported theme "${theme}" for live re-highlighting`);
    }
    if (!highlighter.getLoadedThemes().includes(theme)) {
      await highlighter.loadTheme(bundledThemes[theme as keyof typeof bundledThemes]());
    }
  }

  return highlighter;
}
