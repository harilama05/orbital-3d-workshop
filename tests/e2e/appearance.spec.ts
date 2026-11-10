import { test, expect } from '@playwright/test';

test('surface particles have adjustable brightness, a darker camera, and working quality presets', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await expect(page.getByText('Xưởng tàu sẵn sàng', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.particle-count')).toHaveText('22k hạt màu');
  await expect(page.getByRole('button', { name: 'Đám hạt', exact: true })).toHaveClass('active');
  const filter = await page.locator('.camera-feed').evaluate(el => getComputedStyle(el).filter);
  expect(filter).toContain('brightness(0.48)');
  await page.getByRole('slider', { name: /Độ sáng camera/ }).press('Home');
  expect(await page.locator('.camera-feed').evaluate(el => getComputedStyle(el).filter)).toContain('brightness(0.2)');
  await page.getByRole('slider', { name: /Độ sáng hạt/ }).press('End');
  await expect(page.locator('label[for="particle-brightness"]')).toContainText('220%');
  await page.getByRole('button', { name: 'Nhẹ', exact: true }).click();
  await expect(page.locator('.particle-count')).toHaveText('14k hạt màu');
  await page.getByRole('button', { name: 'Nét', exact: true }).click();
  await expect(page.locator('.particle-count')).toHaveText('44k hạt màu');
  await page.getByRole('button', { name: 'Tự động', exact: true }).click();
  await expect(page.locator('.particle-count')).toHaveText('22k hạt màu');
  expect(errors).toEqual([]);
});
