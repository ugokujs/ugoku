const LANG_ALIASES: Record<string, string> = {
  ts: 'typescript',
  js: 'javascript',
};

export function normalizeLang(lang: string | undefined): string | undefined {
  if (!lang) return lang;
  return LANG_ALIASES[lang] ?? lang;
}
