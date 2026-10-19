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

  await page.locator('.ugoku-run-btn').click();
  await expect(page.locator('.ugoku-output-panel')).toContainText('hello from transitions a');

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
