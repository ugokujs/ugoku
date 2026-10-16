import { expect, test } from 'vitest';
import { resolveMode } from './mode';

test('returns null when run is absent', () => {
  expect(resolveMode(undefined)).toBeNull();
  expect(resolveMode('')).toBeNull();
  expect(resolveMode('{1,3}')).toBeNull();
});

test('returns run when run is present without edit', () => {
  expect(resolveMode('run')).toBe('run');
  expect(resolveMode('run {1,3}')).toBe('run');
});

test('returns run-edit when both run and edit are present', () => {
  expect(resolveMode('run edit')).toBe('run-edit');
  expect(resolveMode('edit run')).toBe('run-edit');
});

test('tokens coexist with other meta flags regardless of position', () => {
  expect(resolveMode('{1,3} run :line-numbers edit [file.ts]')).toBe('run-edit');
});

test('downgrades to run when twoslash is also present', () => {
  expect(resolveMode('run edit twoslash')).toBe('run');
  expect(resolveMode('twoslash run edit')).toBe('run');
});

test('does not match run as a substring of another token', () => {
  expect(resolveMode('run-something')).toBeNull();
  expect(resolveMode('rerun')).toBeNull();
});
