import { transform } from 'sucrase';

export function stripTypes(code: string): string {
  return transform(code, { transforms: ['typescript'] }).code;
}
