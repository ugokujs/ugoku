import { build } from 'esbuild';

await build({
  entryPoints: ['src/edit/standalone-entry.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  outfile: 'dist/edit-standalone.js',
});

console.log('built dist/edit-standalone.js');
