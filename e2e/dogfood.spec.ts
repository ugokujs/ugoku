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
