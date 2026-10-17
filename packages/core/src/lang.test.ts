import { expect, test } from 'vitest';
import { normalizeLang } from './lang';

test('normalizes the "ts" shorthand to "typescript"', () => {
  expect(normalizeLang('ts')).toBe('typescript');
});

test('normalizes the "js" shorthand to "javascript"', () => {
  expect(normalizeLang('js')).toBe('javascript');
});

test('passes already-canonical lang names through unchanged', () => {
  expect(normalizeLang('typescript')).toBe('typescript');
  expect(normalizeLang('javascript')).toBe('javascript');
});

test('passes unrecognized langs through unchanged', () => {
  expect(normalizeLang('python')).toBe('python');
});

test('passes undefined through unchanged', () => {
  expect(normalizeLang(undefined)).toBeUndefined();
});
