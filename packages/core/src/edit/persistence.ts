const PREFIX = 'ugoku:edit:';

export function loadSavedEdit(hash: string): string | null {
  try {
    return localStorage.getItem(PREFIX + hash);
  } catch {
    return null;
  }
}

export function saveEdit(hash: string, value: string): void {
  try {
    localStorage.setItem(PREFIX + hash, value);
  } catch {
    // Private browsing, quota exceeded, or storage disabled — degrade to
    // in-memory-only editing for this page view.
  }
}

export function clearSavedEdit(hash: string): void {
  try {
    localStorage.removeItem(PREFIX + hash);
  } catch {
    // See saveEdit.
  }
}
