import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test('real GLB assets load; preview, cancel, install, remove, and reload preserve assembly', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Xưởng tàu sẵn sàng')).toBeVisible();
  await expect(page.locator('.scene-host > canvas')).toBeVisible();
  await page.screenshot({ path: 'test-results/workshop-assembled.png' });
  await page.getByRole('button', { name: 'Tùy biến', exact: true }).first().click();

  await page.getByRole('button', { name: 'Xem thử động cơ gọn', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Động cơ gọn', exact: true })).toBeVisible();
  await expect(page.locator('.part-properties')).toContainText('Xem thử · chưa lắp');
  await page.getByRole('button', { name: 'Hủy xem thử', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Động cơ hạng nặng', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Xem thử động cơ gọn', exact: true }).click();
  await page.getByRole('button', { name: 'Lắp linh kiện', exact: true }).click();
  await expect(page.locator('.part-card.chosen')).toContainText('ĐÃ LẮP');
  await page.getByRole('button', { name: 'Tháo linh kiện', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Vị trí đang trống' })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Xưởng tàu sẵn sàng')).toBeVisible();
  await page.getByRole('button', { name: 'Tùy biến', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Vị trí đang trống' })).toBeVisible();
  await page.getByRole('button', { name: 'Xem thử động cơ tiêu chuẩn', exact: true }).click();
  await page.getByRole('button', { name: 'Lắp linh kiện', exact: true }).click();
  await page.getByRole('button', { name: 'Bung mô hình', exact: true }).click();
  await expect(page.locator('.view-badge')).toHaveText('EXPLODED');
  await page.waitForTimeout(750);
  await page.screenshot({ path: 'test-results/workshop-exploded.png' });
  await page.getByRole('button', { name: 'Xem riêng bộ phận', exact: true }).click();
  await expect(page.locator('.view-badge')).toContainText('ISOLATED');
  await page.getByRole('button', { name: 'Về toàn bộ mô hình', exact: true }).click();
  await page.getByRole('button', { name: 'Khám phá', exact: true }).click();
  await page.reload();
  await expect(page.getByText('Xưởng tàu sẵn sàng')).toBeVisible();
  await page.getByRole('button', { name: 'Tùy biến', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Động cơ tiêu chuẩn', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('only compatible parts appear, import rejects incompatible configuration, and export is valid', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('Xưởng tàu sẵn sàng')).toBeVisible();
  await page.locator('.structure-details > summary').click();
  await page.locator('.assembly-tree').getByRole('button', { name: /Vũ khí/ }).click();
  await expect(page.locator('.part-card')).toHaveCount(4);
  await expect(page.locator('.catalog-panel')).not.toContainText('Động cơ gọn');
  await page.getByRole('button', { name: 'Xem thử giàn tên lửa' }).click();
  await page.getByRole('button', { name: 'Lắp linh kiện', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Xuất', exact: true }).click();
  const download = await downloadPromise;
  const exported = JSON.parse(await fs.readFile((await download.path())!, 'utf-8'));
  expect(exported.model).toBe('cruiser-01');
  expect(exported.parts.weapon).toBe('missile-pod');
  const config = await page.evaluate(() => JSON.parse(localStorage.getItem('orbital-workshop:configuration:v1')!));
  expect(config.parts.weapon).toBe('missile-pod');
  await page.getByLabel('File cấu hình JSON').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...config, parts: { ...config.parts, engine: 'radar' } })) });
  await expect(page.getByRole('status').filter({ hasText: 'Linh kiện không tương thích' })).toBeVisible();
  const valid = { ...config, parts: { ...config.parts, engine: 'engine-small', cargo: null } };
  await page.getByLabel('File cấu hình JSON').setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(valid)) });
  await page.locator('.assembly-tree').getByRole('button', { name: /Khoang phụ/ }).click();
  await expect(page.getByRole('heading', { name: 'Vị trí đang trống' })).toBeVisible();
});

test('webcam initializes actual local hand model and releases camera on stop', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('Xưởng tàu sẵn sàng')).toBeVisible();
  await page.getByRole('button', { name: 'Bật theo dõi tay', exact: true }).click();
  await expect(page.locator('.webcam-caption')).toContainText('CPU · xử lý trên máy', { timeout: 45000 });
  await expect(page.locator('.hand-status')).toContainText('Đưa tay vào khung hình', { timeout: 15000 });
  expect(await page.locator('.camera-feed').evaluate((el: HTMLVideoElement) => (el.srcObject as MediaStream)?.getVideoTracks()[0].readyState)).toBe('live');
  const bounds = await page.locator('.camera-feed').boundingBox();
  expect(bounds?.width).toBe(1440); expect(bounds?.height).toBe(1000);
  await page.getByRole('button', { name: 'Tháo lắp', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/workshop-webcam.png' });
  await page.getByRole('button', { name: 'Tắt webcam', exact: true }).click();
  await expect(page.locator('.webcam-caption')).not.toBeVisible();
  expect(await page.locator('.camera-feed').evaluate((el: HTMLVideoElement) => el.srcObject)).toBeNull();
});

test('mobile layout has no horizontal overflow and help supports keyboard dismissal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/'); await expect(page.getByText('Xưởng tàu sẵn sàng')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/workshop-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Hướng dẫn điều khiển', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});


test('diagnostics are opt-in and copy real pipeline measurements without camera content', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.locator('.diagnostics-panel')).toHaveCount(0);
  await page.goto('/?debug=1');
  const panel = page.getByRole('complementary', { name: 'Performance diagnostics' });
  await expect(panel).toBeVisible();
  const copy = panel.getByRole('button', { name: 'Copy report', exact: true });
  await expect(copy).toBeDisabled();
  await page.waitForFunction(() => (document.querySelector('.camera-toggle') as HTMLButtonElement)?.disabled === false);
  await page.locator('.camera-toggle').click();
  await expect(copy).toBeEnabled({ timeout: 60000 });
  await expect(panel.locator('[data-metric="inference-ms"]')).toHaveText(/\d+.*ms/, { timeout: 60000 });
  await context.grantPermissions(['camera', 'clipboard-read', 'clipboard-write']);
  await copy.click();
  const report = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(report.trackingFPS).toBeGreaterThan(0);
  expect(report.inferenceMs).toBeGreaterThanOrEqual(0);
  expect(report.captureMs).toBeGreaterThanOrEqual(0);
  expect(report.pipelineMs).toBeGreaterThanOrEqual(report.inferenceMs - 1);
  expect(report.maxPipelineMs).toBeGreaterThanOrEqual(report.pipelineMs);
  expect(report.render.fps).toBeGreaterThanOrEqual(0);
  expect(report.camera.width).toBeGreaterThan(0);
  expect(report.camera.height).toBeGreaterThan(0);
  expect(Object.keys(report.camera).sort()).toEqual(['fps', 'height', 'width']);
  expect(report.origin).toBe('http://127.0.0.1:5173');
  expect(report.build).toContain('/src/main.tsx');
  expect(report.render.points).toEqual(expect.any(Number));
  for (const key of ['points', 'worldPoints', 'landmarks', 'deviceId', 'groupId']) expect(report).not.toHaveProperty(key);
  await page.locator('.camera-toggle').click();
  await expect(copy).toBeDisabled();
});


test('diagnostics keep reporting while an inference frame is stalled', async ({ page, context }) => {
  await page.addInitScript(() => {
    const original = Worker.prototype.postMessage as (...args: any[]) => void;
    Worker.prototype.postMessage = function (data: any, ...args: any[]) {
      if (data?.type === 'frame') { data.bitmap.close(); return; }
      return original.call(this, data, ...args);
    };
  });
  await page.goto('/?debug=1');
  await page.waitForFunction(() => (document.querySelector('.camera-toggle') as HTMLButtonElement)?.disabled === false);
  await page.locator('.camera-toggle').click();
  const panel = page.locator('.diagnostics-panel');
  await expect(panel.locator('[data-metric="pending-ms"]')).toHaveText(/\d+.*ms/, { timeout: 60000 });
  await context.grantPermissions(['camera', 'clipboard-read', 'clipboard-write']);
  await panel.getByRole('button', { name: 'Copy report', exact: true }).click();
  const report = JSON.parse(await page.evaluate(() => navigator.clipboard.readText()));
  expect(report.pendingMs).toBeGreaterThan(0);
  expect(report.samples).toBe(0);
  expect(report.trackingFPS).toBe(0);
  expect(report.inferenceMs).toBeNull();
  expect(report.pipelineMs).toBeNull();
  await page.locator('.camera-toggle').click();
});
