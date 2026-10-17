import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const EDIT_DIST_FILE = path.join(ROOT, 'packages/core/dist/edit-standalone.js');
const TS_DIST_FILE = path.join(ROOT, 'packages/core/dist/ts-standalone.js');

const FIXTURE_HTML = `<!doctype html>
<html>
<body>
<pre data-ugoku-lang="typescript" data-ugoku-theme="github-light"><code>let x: number = 1;</code></pre>
<script type="module">
  import { highlightInto } from '/edit-standalone.js';
  import { stripTypes } from '/ts-standalone.js';

  const pre = document.querySelector('pre');
  const results = [];

  highlightInto(pre, pre.querySelector('code').textContent)
    .then(() => {
      results.push(pre.className.includes('shiki') ? 'EDIT_OK' : 'EDIT_FAILED');
    })
    .catch((e) => {
      results.push('EDIT_FAILED: ' + e.message);
    })
    .then(() => {
      try {
        const stripped = stripTypes('const x: number = 1; console.log(x);');
        results.push(stripped.includes(': number') ? 'TS_FAILED: types not stripped' : 'TS_OK');
      } catch (e) {
        results.push('TS_FAILED: ' + e.message);
      }
      document.title = results.join(' | ');
    });
</script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  if (req.url === '/edit-standalone.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.end(await readFile(EDIT_DIST_FILE));
    return;
  }
  if (req.url === '/ts-standalone.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.end(await readFile(TS_DIST_FILE));
    return;
  }
  res.setHeader('Content-Type', 'text/html');
  res.end(FIXTURE_HTML);
});

await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/`);
await page.waitForFunction(() => document.title !== '');
const title = await page.title();
await browser.close();
server.close();

if (!title.includes('EDIT_OK') || !title.includes('TS_OK')) {
  console.error('FAILED:', title);
  process.exit(1);
}
console.log('PASS:', title);
