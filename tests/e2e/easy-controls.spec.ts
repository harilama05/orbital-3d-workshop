import { test, expect } from '@playwright/test';

test('real controller opens/closes assembly, selects a part by dwell, and keeps inspection isolated', async ({ page }) => {
  // Includes real CPU hand-model startup and a full sequence of 3D interactions.
  test.slow();
  await page.goto('/'); await expect(page.getByText('Xưởng tàu sẵn sàng')).toBeVisible();
  await page.evaluate(async () => {
    const path = performance.getEntriesByType('resource').find(entry => /\/src\/hands\.ts(?:\?|$)/.test(entry.name))?.name ?? '/src/hands.ts';
    const { HandController } = await import(/* @vite-ignore */ path);
    const original = HandController.prototype.start;
    HandController.prototype.start = function () { (window as any).__controller = this; return original.call(this); };
  });
  await page.getByRole('button', { name: 'Bật theo dõi tay', exact: true }).click();
  await expect(page.locator('.webcam-caption')).toContainText('CPU · xử lý trên máy', { timeout: 45000 });
  await page.evaluate(() => {
    const c = (window as any).__controller;
    c.worker.terminate(); c.busy = true; // Keep actual UI callbacks, replace the fake-camera landmarks only.
    const source = [[.5,.8],[.42,.73],[.34,.65],[.29,.56],[.25,.47],[.4,.61],[.39,.45],[.38,.35],[.37,.25],[.5,.58],[.5,.4],[.5,.28],[.5,.16],[.59,.6],[.61,.44],[.62,.34],[.63,.23],[.67,.64],[.71,.52],[.73,.44],[.75,.36]];
    function palm(fist = false, angle = 0) {
      const points = source.map(([x,y]) => ({ x, y, z: 0 }));
      if (fist) { for (const [tip,mcp] of [[8,5],[12,9],[16,13],[20,17]]) points[tip] = { ...points[mcp], y: points[mcp].y + .02 }; points[4] = { ...points[8] }; }
      const rotated = points.map(p => ({ x: .5+(p.x-.5)*Math.cos(angle)-(p.y-.8)*Math.sin(angle), y: .8+(p.x-.5)*Math.sin(angle)+(p.y-.8)*Math.cos(angle), z: 0 }));
      return { points: rotated, handedness: 'Right' };
    }
    function pointer(x: number, y: number) {
      const hand = palm();
      for (const [tip,mcp] of [[12,9],[16,13],[20,17]]) hand.points[tip] = { ...hand.points[mcp], y: hand.points[mcp].y + .02 };
      const scale = Math.max(innerWidth/c.video.videoWidth, innerHeight/c.video.videoHeight);
      const nx = 1-(x-(innerWidth-c.video.videoWidth*scale)/2)/(c.video.videoWidth*scale);
      const ny = (y-(innerHeight-c.video.videoHeight*scale)/2)/(c.video.videoHeight*scale);
      const tip = hand.points[8];
      hand.points = hand.points.map(p => ({ x: nx+(p.x-tip.x)*.4, y: ny+(p.y-tip.y)*.4, z: 0 }));
      return hand;
    }
    (window as any).__gesture = { palm, pointer };
    (window as any).__engineStart = c.getScene().mounted.get('engine').group.position.toArray();
  });
  await page.evaluate(async () => { const c=(window as any).__controller; for(let i=0;i<4;i++){c.process([(window as any).__gesture.palm()]);await new Promise(r=>setTimeout(r,45));} });
  await expect(page.locator('.view-badge')).toHaveText('EXPLODED');
  await page.waitForTimeout(650);
  const separation = await page.evaluate(() => { const p=(window as any).__controller.getScene().mounted.get('engine').group.position; const a=(window as any).__engineStart; return Math.hypot(p.x-a[0],p.y-a[1],p.z-a[2]); });
  expect(separation).toBeGreaterThan(4);
  const marker = page.getByRole('button', { name: 'Chọn vũ khí', exact: true });
  const bounds = (await marker.boundingBox())!;
  await page.evaluate(async ({ x,y }) => {
    const c=(window as any).__controller; const scene=c.getScene(); const original=scene.callbacks.onSelect;
    (window as any).__selectedTimes=0; scene.callbacks.onSelect=(key: string)=>{(window as any).__selectedTimes++;original(key);};
    for(let i=0;i<30;i++){c.process([(window as any).__gesture.pointer(x,y)]);await new Promise(r=>setTimeout(r,40));}
  }, { x: bounds.x+bounds.width/2, y: bounds.y+bounds.height/2 });
  await expect(page.locator('.inspector-content h2')).toHaveText('Tháp pháo đôi');
  expect(await page.evaluate(() => (window as any).__selectedTimes)).toBe(1);
  await page.getByRole('button', { name: 'Xem riêng bộ phận', exact: true }).click();
  await page.evaluate(async () => { const c=(window as any).__controller; for(let i=0;i<6;i++){c.process([(window as any).__gesture.palm(false,i*.03)]);await new Promise(r=>setTimeout(r,40));} });
  await expect(page.locator('.view-badge')).toHaveText('ISOLATED');
  await page.getByRole('button', { name: 'Về toàn bộ mô hình', exact: true }).click();
  await page.evaluate(async () => { const c=(window as any).__controller; for(let i=0;i<4;i++){c.process([(window as any).__gesture.palm(true)]);await new Promise(r=>setTimeout(r,45));} });
  await expect(page.locator('.view-badge')).toHaveText('ASSEMBLED');
  await page.waitForTimeout(650);
  expect(await page.evaluate(() => { const p=(window as any).__controller.getScene().mounted.get('engine').group.position; const a=(window as any).__engineStart; return Math.hypot(p.x-a[0],p.y-a[1],p.z-a[2]); })).toBeLessThan(.03);
  const immediateMotion = await page.evaluate(() => {
    const scene=(window as any).__controller.getScene();
    scene.resetCamera();
    const before=scene.camera.position.clone(); const distance=scene.camera.position.distanceTo(scene.controls.target);
    scene.pan(.04,.02); scene.zoom(1.3);
    (window as any).__motionStart={position:before.toArray(),distance};
    return scene.camera.position.distanceTo(before);
  });
  expect(immediateMotion).toBeLessThan(.00001);
  await page.waitForTimeout(500);
  const animatedMotion = await page.evaluate(() => {
    const scene=(window as any).__controller.getScene(), start=(window as any).__motionStart;
    return { traveled:Math.hypot(...scene.camera.position.toArray().map((value: number,i: number)=>value-start.position[i])), distance:scene.camera.position.distanceTo(scene.controls.target), expected:start.distance/1.3 };
  });
  expect(animatedMotion.traveled).toBeGreaterThan(.5);
  expect(Math.abs(animatedMotion.distance-animatedMotion.expected)).toBeLessThan(.15);
  // Keep the live controller when swapping the scene: generic part keys must
  // still support hand assembly and dwell selection after the ship is gone.
  await page.getByRole('button', { name: 'Chọn mô hình', exact: true }).click();
  await page.getByRole('button', { name: 'Mở Ô tô City', exact: true }).click();
  await expect(page.getByText('Mô hình sẵn sàng', { exact: true })).toBeVisible();
  await page.evaluate(async () => { const c=(window as any).__controller; for(let i=0;i<5;i++){c.process([(window as any).__gesture.palm()]);await new Promise(r=>setTimeout(r,45));} });
  await expect(page.locator('.view-badge')).toHaveText('EXPLODED');
  await page.waitForTimeout(650);
  const wheelBounds = (await page.getByRole('button', { name:'Chọn bánh trước trái', exact:true }).boundingBox())!;
  await page.evaluate(async ({x,y}) => { const c=(window as any).__controller; for(let i=0;i<30;i++){c.process([(window as any).__gesture.pointer(x,y)]);await new Promise(r=>setTimeout(r,40));} }, {x:wheelBounds.x+wheelBounds.width/2,y:wheelBounds.y+wheelBounds.height/2});
  await expect(page.locator('.inspector-content h2')).toHaveText('Bánh nguyên bản');
  await expect(page.locator('.catalog-panel')).toBeVisible();
  await page.getByRole('button', { name: 'Tắt webcam', exact: true }).click();
});
