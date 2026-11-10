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


test('Auto reserves drawing capacity for slow GPU tracking without removing geometry', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 695 });
  await page.goto('/');
  await page.waitForFunction(() => (document.querySelector('.camera-toggle') as HTMLButtonElement)?.disabled === false);
  await page.evaluate(async () => {
    const url = performance.getEntriesByType('resource').find(e => /\/src\/scene\.ts(?:\?|$)/.test(e.name))!.name;
    const { WorkshopScene } = await import(/* @vite-ignore */ url);
    const original = WorkshopScene.prototype.update;
    WorkshopScene.prototype.update = function (state: any) { (window as any).__qualityScene = this; return original.call(this, state); };
  });
  await page.locator('#particle-brightness').press('ArrowRight');
  const result = await page.evaluate(() => {
    const scene = (window as any).__qualityScene;
    const size = () => scene.renderer.domElement.width * scene.renderer.domElement.height;
    const geometry = () => [...scene.mounted.values()].map((m: any) => [m.id, m.cloud.geometry.drawRange.count, m.outline.geometry.getAttribute('position').count]);
    const initial = size(), originalGeometry = geometry();
    scene.update({ ...scene.state, tracking: true });
    scene.setTrackingLoad(15, 'GPU');
    const fast = size();
    scene.setTrackingLoad(150, 'CPU');
    const cpu = size();
    scene.setTrackingLoad(150, 'GPU');
    const slow = size(), slowGeometry = geometry();
    scene.setTrackingLoad(150, 'GPU');
    const repeated = size();
    scene.update({ ...scene.state, quality: 'detail' });
    const manual = size();
    scene.setTrackingLoad(150, 'GPU');
    const manualAfterLoad = size();
    scene.update({ ...scene.state, quality: 'auto', tracking: false });
    return { initial, fast, cpu, slow, repeated, originalGeometry, slowGeometry, manual, manualAfterLoad, restored: size() };
  });
  expect(result.fast).toBe(result.initial);
  expect(result.cpu).toBe(result.initial);
  expect(result.slow).toBeLessThan(result.initial * .8);
  expect(result.repeated).toBe(result.slow);
  expect(result.slowGeometry).toEqual(result.originalGeometry);
  expect(result.manualAfterLoad).toBe(result.manual);
  expect(result.manual).toBeGreaterThan(result.slow);
  expect(result.restored).toBe(result.initial);
});
