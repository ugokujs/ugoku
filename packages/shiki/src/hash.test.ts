import { expect, test } from 'vitest';
import { hashSource } from './hash';

test('produces a 10-character lowercase hex string', () => {
  expect(hashSource('console.log(1)')).toMatch(/^[0-9a-f]{10}$/);
});

test('is deterministic for the same source', () => {
  expect(hashSource('const x = 1;')).toBe(hashSource('const x = 1;'));
});

test('changes when the source changes', () => {
  expect(hashSource('const x = 1;')).not.toBe(hashSource('const x = 2;'));
});
