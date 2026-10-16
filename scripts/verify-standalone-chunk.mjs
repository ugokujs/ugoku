import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST_FILE = path.join(ROOT, 'packages/core/dist/edit-standalone.js');

const FIXTURE_HTML = `<!doctype html>
<html>
<body>
<pre data-ugoku-lang="typescript" data-ugoku-theme="github-light"><code>let x: number = 1;</code></pre>
<script type="module">
  import { highlightInto } from '/edit-standalone.js';
  const pre = document.querySelector('pre');
  highlightInto(pre, pre.querySelector('code').textContent).then(() => {
    document.title = pre.className.includes('shiki') ? 'DONE' : 'FAILED';
  }).catch((e) => {
    document.title = 'FAILED: ' + e.message;
  });
</script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  if (req.url === '/edit-standalone.js') {
    res.setHeader('Content-Type', 'application/javascript');
    res.end(await readFile(DIST_FILE));
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

if (title !== 'DONE') {
  console.error('FAILED:', title);
  process.exit(1);
}
console.log('PASS: standalone chunk re-highlighted a block with no bundler present');
