import { test, expect } from '@playwright/test';

test('home page mounts run and run-edit blocks and Run produces output', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('pre[data-ugoku-mode="run"]').first()).toHaveAttribute('data-ugoku-mounted', 'true');
  await expect(page.locator('pre[data-ugoku-mode="run-edit"]').first()).toHaveAttribute(
    'data-ugoku-mounted',
    'true',
  );

  await page.locator('.ugoku-run-btn').first().click();
  await expect(page.locator('.ugoku-output-panel').first()).toContainText('hello from home');
});

test('SPA navigation unmounts the old page and mounts the new one', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'More examples' }).click();
  await page.waitForURL('**/page2*');

  await expect(page.locator('.ugoku-controls')).toHaveCount(3);
  await expect(page.locator('pre[data-ugoku-mode]').first()).toHaveAttribute('data-ugoku-mounted', 'true');

  await page.locator('.ugoku-run-btn').first().click();
  await expect(page.locator('.ugoku-output-panel').first()).toContainText('hello from page 2');
});

test('editing a run-edit block persists across reload, re-highlights, and Reset restores it', async ({ page }) => {
  await page.goto('/');

  // .first() targets the JS run-edit block specifically — the page now also
  // has a ts run-edit block (added for TypeScript execution coverage).
  const overlay = page.locator('pre[data-ugoku-mode="run-edit"] .ugoku-edit-overlay').first();
  const originalValue = await overlay.inputValue();
  expect(originalValue).toContain('total');
  await overlay.click();
  await overlay.fill('console.log("edited");');

  // Wait past the 400ms save debounce before reloading.
  await page.waitForTimeout(600);
  await page.reload();

  const reloadedOverlay = page.locator('pre[data-ugoku-mode="run-edit"] .ugoku-edit-overlay').first();
  await expect(reloadedOverlay).toHaveValue('console.log("edited");');
  await expect(page.locator('pre[data-ugoku-mode="run-edit"] code').first()).toContainText('edited');

  const runBtn = page.locator('pre[data-ugoku-mode="run-edit"] + .ugoku-controls .ugoku-run-btn').first();
  await runBtn.click();
  const panel = page.locator('pre[data-ugoku-mode="run-edit"] + .ugoku-controls + .ugoku-output-panel').first();
  await expect(panel).toContainText('edited');

  const resetBtn = page.locator('pre[data-ugoku-mode="run-edit"] + .ugoku-controls .ugoku-reset-btn').first();
  await resetBtn.click();
  await expect(reloadedOverlay).toHaveValue(originalValue);
});

test('the edit overlay is actually styled as a transparent overlay, not an opaque textarea', async ({ page }) => {
  await page.goto('/');

  const pre = page.locator('pre[data-ugoku-mode="run-edit"]').first();
  const overlay = pre.locator('.ugoku-edit-overlay');

  const overlayStyles = await overlay.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { position: cs.position, color: cs.color, backgroundColor: cs.backgroundColor };
  });
  expect(overlayStyles.position).toBe('absolute');
  expect(overlayStyles.color).toBe('rgba(0, 0, 0, 0)');
  expect(overlayStyles.backgroundColor).toBe('rgba(0, 0, 0, 0)');

  const preStyles = await pre.evaluate((el) => getComputedStyle(el).position);
  expect(preStyles).toBe('relative');

  // The original highlighted code must still be visible/readable underneath
  // the overlay before any edit — this is the actual bug a missing CSS
  // import would cause (an opaque textarea hiding the code entirely).
  await expect(pre.locator('code')).toContainText('total');

  // Focusing must flip the overlay to a fully opaque plain-text editor —
  // the fix for "cursor nowhere near the text": a transparent caret can
  // never be kept in sync with a separately-positioned highlighted <code>
  // element, so focus mode abandons that sync requirement entirely by
  // covering the code instead of layering invisibly on top of it.
  await overlay.click();
  const focusedStyles = await overlay.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { color: cs.color, backgroundColor: cs.backgroundColor };
  });
  expect(focusedStyles.color).not.toBe('rgba(0, 0, 0, 0)');
  expect(focusedStyles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
  await expect(overlay).toHaveValue(/total/);
});

test('the focused overlay matches the highlighted code\'s font exactly, not the page body font', async ({ page }) => {
  await page.goto('/');

  const pre = page.locator('pre[data-ugoku-mode="run-edit"]').first();
  const overlay = pre.locator('.ugoku-edit-overlay');
  await overlay.click();

  // `font: inherit` would inherit from the overlay's actual DOM parent
  // (<pre>), but VitePress sets font-size/line-height on <code>, not <pre> —
  // so an overlay relying on inheritance ends up body-sized instead of
  // matching the visibly rendered code.
  const [codeFont, overlayFont] = await Promise.all([
    pre.locator('code').evaluate((el) => {
      const cs = getComputedStyle(el);
      return { fontFamily: cs.fontFamily, fontSize: cs.fontSize, lineHeight: cs.lineHeight };
    }),
    overlay.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { fontFamily: cs.fontFamily, fontSize: cs.fontSize, lineHeight: cs.lineHeight };
    }),
  ]);
  expect(overlayFont).toEqual(codeFont);
});

test('a re-highlighted run-edit block keeps dark-theme colors after an edit, instead of resetting to light', async ({
  page,
}) => {
  await page.goto('/');

  await page.locator('.VPSwitchAppearance').first().click();
  await expect(page.locator('html')).toHaveClass(/dark/);

  const pre = page.locator('pre[data-ugoku-mode="run-edit"]').first();
  const overlay = pre.locator('.ugoku-edit-overlay');
  await overlay.click();
  await overlay.fill('console.log("dark theme check");');
  await page.locator('h1').click(); // blur -> flushes the debounced rehighlight
  await page.waitForTimeout(500);

  // VitePress's dark-mode span-color rule (`.dark .vp-code span { color:
  // var(--shiki-dark) }`) only applies if the re-highlighted <pre> keeps the
  // `vp-code` class and its spans carry no competing inline `color`.
  await expect(pre).toHaveClass(/vp-code/);

  // The outermost span per line is shiki's unstyled `.line` wrapper — the
  // colored token spans are nested one level deeper.
  const span = pre.locator('code .line span').first();
  const { computedColor, shikiDarkVar } = await span.evaluate((el) => {
    const shikiDark = el.getAttribute('style')?.match(/--shiki-dark:\s*([^;]+)/)?.[1]?.trim();
    const probe = document.createElement('span');
    if (shikiDark) probe.style.color = shikiDark;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return { computedColor: getComputedStyle(el).color, shikiDarkVar: resolved };
  });
  expect(computedColor).toBe(shikiDarkVar);
});

test('Run on a ts-lang "run" block strips types and executes successfully', async ({ page }) => {
  await page.goto('/');

  const runBtn = page.locator('pre[data-ugoku-mode="run"][data-ugoku-lang="ts"] + .ugoku-controls .ugoku-run-btn');
  const panel = page.locator(
    'pre[data-ugoku-mode="run"][data-ugoku-lang="ts"] + .ugoku-controls + .ugoku-output-panel',
  );

  await runBtn.click();
  await expect(panel).toContainText('"sum:" 5');
});

test('Run on a ts-lang "run edit" block strips types and executes successfully', async ({ page }) => {
  await page.goto('/');

  const runBtn = page.locator(
    'pre[data-ugoku-mode="run-edit"][data-ugoku-lang="ts"] + .ugoku-controls .ugoku-run-btn',
  );
  const panel = page.locator(
    'pre[data-ugoku-mode="run-edit"][data-ugoku-lang="ts"] + .ugoku-controls + .ugoku-output-panel',
  );

  await runBtn.click();
  await expect(panel).toContainText('"distance:" 5');
});
