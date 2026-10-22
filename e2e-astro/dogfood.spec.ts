import { test, expect } from '@playwright/test';

test('plain MPA pages mount and run independently across a real page navigation', async ({ page }) => {
  await page.goto('/');

  await page.locator('.ugoku-run-btn').click();
  await expect(page.locator('.ugoku-output-panel')).toContainText('hello from astro mpa home');

  await page.getByRole('link', { name: 'Go to page 2' }).click();
  await page.waitForURL('**/page2');

  await page.locator('.ugoku-run-btn').click();
  await expect(page.locator('.ugoku-output-panel')).toContainText('hello from astro mpa page 2');
});

test('ClientRouter transitions mount/unmount blocks across a soft navigation, not a full reload', async ({ page }) => {
  let loadEventCount = 0;
  page.on('load', () => {
    loadEventCount += 1;
  });

  await page.goto('/transitions/a');
  expect(loadEventCount).toBe(1);

  await page.locator('pre[data-ugoku-mode="run"] + .ugoku-controls .ugoku-run-btn').click();
  await expect(
    page.locator('pre[data-ugoku-mode="run"] + .ugoku-controls + .ugoku-output-panel'),
  ).toContainText('hello from transitions a');

  await page.getByRole('link', { name: 'Go to B' }).click();
  await page.waitForURL('**/transitions/b');

  // A real full page load would fire Playwright's 'load' event again.
  // Asserting it's still 1 proves ClientRouter did a soft, in-page
  // transition rather than a full reload — the one case plain MPA pages
  // (previous test) structurally can't exercise, since they never load
  // <ClientRouter />.
  expect(loadEventCount).toBe(1);

  await page.locator('.ugoku-run-btn').click();
  await expect(page.locator('.ugoku-output-panel')).toContainText('hello from transitions b');
});

test("an active run edit block's worker is terminated when ClientRouter navigates away", async ({ page }) => {
  await page.goto('/transitions/a');

  const [worker] = await Promise.all([
    page.waitForEvent('worker'),
    page.locator('pre[data-ugoku-mode="run-edit"] + .ugoku-controls .ugoku-run-btn').click(),
  ]);

  await expect(
    page.locator('pre[data-ugoku-mode="run-edit"] + .ugoku-controls + .ugoku-output-panel'),
  ).toContainText('tick');

  let workerClosed = false;
  worker.once('close', () => {
    workerClosed = true;
  });

  await page.getByRole('link', { name: 'Go to B' }).click();
  await page.waitForURL('**/transitions/b');

  // The runner's own timeout is 10s (packages/core/src/runner/run-code.ts).
  // If unmount() didn't terminate the worker, it would eventually close on
  // its own via that timeout — which would make this assertion pass for the
  // wrong reason. Waiting only 3s (well under 10s) keeps this a true
  // negative control: it fails if the worker is still alive this soon
  // after navigating away, which is the only way it can still be alive if
  // astro:before-swap -> unmount() -> stop() -> worker.terminate() ran.
  await page.waitForTimeout(3000);
  expect(workerClosed).toBe(true);
});

test("a second integration's own Shiki transformer composes with ugoku's, not overwritten by it", async ({ page }) => {
  await page.goto('/');

  const pre = page.locator('pre[data-ugoku-mode="run"]').first();
  await expect(pre).toHaveAttribute('data-ugoku-mode', 'run');
  await expect(pre).toHaveAttribute('data-dummy-transformer', 'true');
});

test("ugoku's CSS actually reaches the page in a real production build, not just dev mode", async ({ page }) => {
  await page.goto('/');

  await page.locator('.ugoku-run-btn').click();
  const panel = page.locator('.ugoku-output-panel');
  await expect(panel).toBeVisible();

  // .ugoku-output-panel sets white-space: pre-wrap in
  // packages/core/src/output-panel/styles.css — a plain unstyled <div>
  // defaults to white-space: normal, so this can only be 'pre-wrap' if
  // the real CSS file loaded. e2e-astro's webServer runs a real
  // `astro build` + `astro preview` (not `astro dev`), which is exactly
  // where this CSS previously went missing.
  await expect(panel).toHaveCSS('white-space', 'pre-wrap');
});
