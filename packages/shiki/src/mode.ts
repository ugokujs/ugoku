export type UgokuMode = 'run' | 'run-edit';

export function resolveMode(rawMeta: string | undefined): UgokuMode | null {
  const tokens = new Set((rawMeta ?? '').split(/\s+/).filter(Boolean));
  if (!tokens.has('run')) return null;
  if (tokens.has('edit') && !tokens.has('twoslash')) return 'run-edit';
  return 'run';
}
