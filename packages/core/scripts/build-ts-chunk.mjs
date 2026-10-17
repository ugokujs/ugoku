import { build } from 'esbuild';

await build({
  entryPoints: ['src/ts/strip.ts'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  minify: true,
  outfile: 'dist/ts-standalone.js',
});

console.log('built dist/ts-standalone.js');
