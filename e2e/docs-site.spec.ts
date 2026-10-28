import { test, expect } from '@playwright/test';

test('home page renders the hero and feature cards', async ({ page }) => {
  await page.goto('/');

  await expect(page.locator('.VPHero .tagline')).toContainText(
    'Add run to a code fence and readers get a Run button with live console output.',
  );
  await expect(page.getByRole('link', { name: 'Get Started' }).first()).toHaveAttribute('href', '/guide');
  await expect(page.getByRole('link', { name: 'GitHub' }).first()).toHaveAttribute(
    'href',
    'https://github.com/ugokujs/ugoku',
  );
  await expect(page.locator('.VPFeature .title')).toHaveCount(4);
});
