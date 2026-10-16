import { expect, test, vi } from 'vitest';
import { loadSavedEdit, saveEdit, clearSavedEdit } from './persistence';

test('saveEdit then loadSavedEdit round-trips a value', () => {
  saveEdit('hash-a', 'let x = 1;');
  expect(loadSavedEdit('hash-a')).toBe('let x = 1;');
  clearSavedEdit('hash-a');
});

test('loadSavedEdit returns null when nothing is saved', () => {
  expect(loadSavedEdit('never-saved-hash')).toBeNull();
});

test('clearSavedEdit removes the saved value', () => {
  saveEdit('hash-b', 'console.log(1)');
  clearSavedEdit('hash-b');
  expect(loadSavedEdit('hash-b')).toBeNull();
});

test('different hashes do not collide', () => {
  saveEdit('hash-c', 'one');
  saveEdit('hash-d', 'two');
  expect(loadSavedEdit('hash-c')).toBe('one');
  expect(loadSavedEdit('hash-d')).toBe('two');
  clearSavedEdit('hash-c');
  clearSavedEdit('hash-d');
});

test('saveEdit does not throw when localStorage.setItem throws', () => {
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota exceeded');
  });
  expect(() => saveEdit('hash-e', 'x')).not.toThrow();
  spy.mockRestore();
});

test('loadSavedEdit returns null when localStorage.getItem throws', () => {
  const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('disabled');
  });
  expect(loadSavedEdit('hash-f')).toBeNull();
  spy.mockRestore();
});
