import { expect, test } from 'vitest';
import {
  registerLanguageLoader,
  registerThemeLoader,
  getLanguageLoader,
  getThemeLoader,
} from './loader-registry';

test('getLanguageLoader returns undefined for an unregistered name', () => {
  expect(getLanguageLoader('never-registered-lang')).toBeUndefined();
});

test('getThemeLoader returns undefined for an unregistered name', () => {
  expect(getThemeLoader('never-registered-theme')).toBeUndefined();
});

test('registerLanguageLoader makes a loader retrievable by name', () => {
  const loader = () => ({ name: 'my-lang', scopeName: 'source.my-lang', patterns: [] });
  registerLanguageLoader('my-lang', loader);
  expect(getLanguageLoader('my-lang')).toBe(loader);
});

test('registerThemeLoader makes a loader retrievable by name', () => {
  const loader = () => ({ name: 'my-theme', type: 'dark' as const, colors: {}, tokenColors: [] });
  registerThemeLoader('my-theme', loader);
  expect(getThemeLoader('my-theme')).toBe(loader);
});

test('registering a name twice overwrites the previous loader (last write wins)', () => {
  const first = () => ({ name: 'dup-lang', scopeName: 'source.dup-lang', patterns: [] });
  const second = () => ({ name: 'dup-lang', scopeName: 'source.dup-lang-v2', patterns: [] });
  registerLanguageLoader('dup-lang', first);
  registerLanguageLoader('dup-lang', second);
  expect(getLanguageLoader('dup-lang')).toBe(second);
});
