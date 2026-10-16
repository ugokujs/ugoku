import { createHash } from 'node:crypto';

const HASH_LENGTH = 10;

export function hashSource(source: string): string {
  return createHash('sha256').update(source).digest('hex').slice(0, HASH_LENGTH);
}
