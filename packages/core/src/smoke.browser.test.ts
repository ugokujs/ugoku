import { expect, test } from 'vitest';

test('runs in a real browser context with Worker and Blob available', () => {
  expect(typeof Worker).toBe('function');
  expect(typeof Blob).toBe('function');
});
