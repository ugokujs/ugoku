import type { LanguageRegistration, ThemeRegistration } from 'shiki';

// Must stay a single module instance shared between @ugoku/core's eager entry
// (where registerLanguageLoader/registerThemeLoader are called, before the
// edit chunk ever loads) and the lazily-imported edit chunk (where
// highlighter-cache.ts reads them back via getLanguageLoader/getThemeLoader).
// A bundler change that ever duplicates this module into two separate chunks
// would make registrations silently invisible to ensureLoaded.
type MaybePromise<T> = T | Promise<T>;
export type LanguageLoader = () => MaybePromise<LanguageRegistration>;
export type ThemeLoader = () => MaybePromise<ThemeRegistration>;

const languageLoaders = new Map<string, LanguageLoader>();
const themeLoaders = new Map<string, ThemeLoader>();

export function registerLanguageLoader(name: string, loader: LanguageLoader): void {
  languageLoaders.set(name, loader);
}

export function registerThemeLoader(name: string, loader: ThemeLoader): void {
  themeLoaders.set(name, loader);
}

export function getLanguageLoader(name: string): LanguageLoader | undefined {
  return languageLoaders.get(name);
}

export function getThemeLoader(name: string): ThemeLoader | undefined {
  return themeLoaders.get(name);
}
