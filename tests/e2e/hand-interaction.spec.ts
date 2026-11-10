import { test, expect } from '@playwright/test';

test('hand pointing clicks UI, catalog dragging does not select, two hands pan and zoom, loss cancels a press', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('Xưởng tàu sẵn sàng')).toBeVisible();
  await page.getByRole('button', { name: 'Tùy biến', exact: true }).first().click();
  await page.evaluate(async () => {
    const modulePath = '/src/hands.ts';
    const { HandController } = await import(/* @vite-ignore */ modulePath);
    const calls = { rotate: 0, rotateWrist: 0, pan: 0, zoom: 0, select: 0 };
    const scene = { rotate: () => calls.rotate++, rotateWrist: () => calls.rotateWrist++, pan: () => calls.pan++, zoom: () => calls.zoom++, selectAt: () => calls.select++, hover: () => null, clearHover: () => {}, hoverPart: () => {} };
    const controller = new HandController(document.createElement('video'), document.createElement('canvas'), [document.createElement('div'), document.createElement('div')], () => scene, { onStatus: () => {}, onError: () => {}, onReady: () => {}, onRange: () => {} });
    controller.running = true;
    function hand(x: number, y: number, pinch: boolean, handedness = 'Right') {
      const scale = Math.max(window.innerWidth / 640, window.innerHeight / 480);
      const nx = (x - (window.innerWidth - 640 * scale) / 2) / (640 * scale);
      const ny = (y - (window.innerHeight - 480 * scale) / 2) / (480 * scale);
      const points = Array.from({ length: 21 }, () => ({ x: .5, y: .5, z: 0 }));
      points[0] = { x: .5, y: .8, z: 0 }; points[9] = { x: .5, y: .6, z: 0 };
      points[8] = { x: 1 - nx, y: ny, z: 0 }; points[4] = { x: 1 - nx + (pinch ? .02 : .15), y: ny, z: 0 };
      return { points, handedness };
    }
    (window as unknown as Record<string, unknown>).__hands = { controller, calls, hand };
  });

  const card = page.getByRole('button', { name: 'Xem thử động cơ gọn', exact: true });
  const rect = (await card.boundingBox())!;
  const pos = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  await page.evaluate(({ x, y }) => {
    const { controller: c, hand: h } = (window as any).__hands;
    for (let i = 0; i < 10; i++) c.process([h(x, y, false)]);
    c.process([h(x, y, true)]); c.process([h(x, y, false)]);
  }, pos);
  await expect(page.getByRole('heading', { name: 'Động cơ gọn', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Hủy xem thử', exact: true }).click();

  await page.locator('[data-catalog]').evaluate(el => { (el as HTMLElement).style.maxWidth = '270px'; });
  await page.evaluate(({ x, y }) => {
    const { controller: c, hand: h } = (window as any).__hands;
    c.process([h(x, y, true)]);
    for (let i = 1; i <= 6; i++) c.process([h(x - i * 12, y, true)]);
    c.process([h(x - 72, y, false)]);
  }, pos);
  await expect(page.locator('.preview-badge')).toHaveCount(0);
  expect(await page.locator('[data-catalog]').evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as any).__hands.calls.rotate)).toBe(0);

  await page.evaluate(() => {
    const { controller: c, hand: h } = (window as any).__hands;
    c.process([]);
    // Both pinches move together first, then move apart.
    c.process([h(600, 500, true, 'Left'), h(900, 500, true)]);
    for (let i = 1; i <= 5; i++) c.process([h(600 + i * 8, 500 + i * 3, true, 'Left'), h(900 + i * 15, 500 + i * 3, true)]);
    c.process([h(640, 515, false, 'Left'), h(975, 515, false)]);
  });
  expect(await page.evaluate(() => (window as any).__hands.calls.pan)).toBeGreaterThan(0);
  expect(await page.evaluate(() => (window as any).__hands.calls.zoom)).toBeGreaterThan(0);

  await page.locator('[data-catalog]').evaluate(el => { el.scrollLeft = 0; });
  await page.evaluate(({ x, y }) => {
    const { controller: c, hand: h } = (window as any).__hands;
    c.process([]);
    c.process([h(x, y, true)]);
    c.process([]); // occlusion cannot produce a release-click
    c.process([h(x, y, false)]);
    c.stop();
  }, pos);
  await expect(page.locator('.preview-badge')).toHaveCount(0);
});

test('open wrist rotates without pinching; translation does not rotate; two open hands move and zoom', async ({ page }) => {
  await page.goto('/'); await expect(page.getByText('Xưởng tàu sẵn sàng')).toBeVisible();
  const result = await page.evaluate(async () => {
    const modulePath = '/src/hands.ts';
    const { HandController } = await import(/* @vite-ignore */ modulePath);
    const calls = { wrist: 0, pan: 0, zoom: 0, oldRotate: 0 };
    const scene = { rotateWrist: () => calls.wrist++, rotate: () => calls.oldRotate++, pan: () => calls.pan++, zoom: () => calls.zoom++, hover: () => null, clearHover: () => {}, hoverPart: () => {} };
    const controller = new HandController(document.createElement('video'), document.createElement('canvas'), [document.createElement('div'),document.createElement('div')], () => scene, { onStatus: () => {}, onError: () => {}, onReady: () => {}, onRange: () => {} });
    controller.running = true;
    const template = [[.5,.8],[.42,.73],[.34,.65],[.29,.56],[.25,.47],[.4,.61],[.39,.45],[.38,.35],[.37,.25],[.5,.58],[.5,.4],[.5,.28],[.5,.16],[.59,.6],[.61,.44],[.62,.34],[.63,.23],[.67,.64],[.71,.52],[.73,.44],[.75,.36]];
    function open(x: number, angle = 0, handedness = 'Right') {
      const points = template.map(([px,py]) => ({x: x + (px-.5)*Math.cos(angle)-(py-.8)*Math.sin(angle), y: .8+(px-.5)*Math.sin(angle)+(py-.8)*Math.cos(angle), z: 0}));
      return { points, handedness };
    }
    for (let i=0;i<5;i++) controller.process([open(.5+i*.005)]);
    const afterTranslation = calls.wrist;
    for (let i=1;i<=6;i++) controller.process([open(.525,i*.03)]);
    const afterRotation = calls.wrist;
    controller.process([]);
    controller.process([open(.3,0,'Left'),open(.65)]);
    for (let i=1;i<=5;i++) controller.process([open(.3-i*.005,0,'Left'),open(.65+i*.015)]);
    controller.stop();
    return { afterTranslation, afterRotation, ...calls };
  });
  expect(result.afterTranslation).toBe(0);
  expect(result.afterRotation).toBeGreaterThan(0);
  expect(result.oldRotate).toBe(0);
  expect(result.pan).toBeGreaterThan(0); expect(result.zoom).toBeGreaterThan(0);
});
