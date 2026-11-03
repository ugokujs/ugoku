import type { LanguageRegistration, ThemeRegistration } from 'shiki';

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
