import { test, expect } from '@playwright/test';

test('home page mounts run and run-edit blocks and Run produces output', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('pre[data-ugoku-mode="run"]')).toHaveAttribute('data-ugoku-mounted', 'true');
  await expect(page.locator('pre[data-ugoku-mode="run-edit"]')).toHaveAttribute('data-ugoku-mounted', 'true');

  await page.locator('.ugoku-run-btn').first().click();
  await expect(page.locator('.ugoku-output-panel').first()).toContainText('hello from home');
});

test('SPA navigation unmounts the old page and mounts the new one', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Go to page 2' }).click();
  await page.waitForURL('**/page2*');

  await expect(page.locator('.ugoku-controls')).toHaveCount(1);
  await expect(page.locator('pre[data-ugoku-mode]')).toHaveAttribute('data-ugoku-mounted', 'true');

  await page.locator('.ugoku-run-btn').first().click();
  await expect(page.locator('.ugoku-output-panel').first()).toContainText('hello from page 2');
});

test('editing a run-edit block persists across reload, re-highlights, and Reset restores it', async ({ page }) => {
  await page.goto('/');

  const overlay = page.locator('pre[data-ugoku-mode="run-edit"] .ugoku-edit-overlay');
  await overlay.click();
  await overlay.fill('console.log("edited");');

  // Wait past the 400ms save debounce before reloading.
  await page.waitForTimeout(600);
  await page.reload();

  const reloadedOverlay = page.locator('pre[data-ugoku-mode="run-edit"] .ugoku-edit-overlay');
  await expect(reloadedOverlay).toHaveValue('console.log("edited");');
  await expect(page.locator('pre[data-ugoku-mode="run-edit"] code')).toContainText('edited');

  const runBtn = page.locator('pre[data-ugoku-mode="run-edit"] + .ugoku-controls .ugoku-run-btn');
  await runBtn.click();
  const panel = page.locator('pre[data-ugoku-mode="run-edit"] + .ugoku-controls + .ugoku-output-panel');
  await expect(panel).toContainText('edited');

  const resetBtn = page.locator('pre[data-ugoku-mode="run-edit"] + .ugoku-controls .ugoku-reset-btn');
  await resetBtn.click();
  await expect(reloadedOverlay).toHaveValue('');
});
