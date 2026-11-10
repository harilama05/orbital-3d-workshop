import { test,expect } from '@playwright/test';

import fs from 'node:fs/promises';

test('five models support compatible preview, cancel, replace, remove, reassembly and independent saved configurations',async({page})=>{
  // Exercises all four modular catalogs with software WebGL in one browser case.
  test.slow();
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByText('Xưởng tàu sẵn sàng')).toBeVisible({timeout:15000});
  await page.evaluate(async()=>{
    const url=performance.getEntriesByType('resource').find(e=>/\/src\/scene\.ts(?:\?|$)/.test(e.name))?.name??'/src/scene.ts';
    const {WorkshopScene}=await import(/* @vite-ignore */url),original=WorkshopScene.prototype.setMarkers;
    WorkshopScene.prototype.setMarkers=function(...args:any[]){(window as any).__modScene=this;return original.apply(this,args);};
  });
  for(const [name,slot,variant,expectedCount]of[['Ô tô City','Bánh trước trái','Bánh thể thao',3],['Mech Line','Chân / khung gầm','Khung bánh xích',3],['Carbine','Ống ngắm','Ngắm Holo',3],['Pistol','Hộp tiếp đạn','Hộp dài',3]] as const){
    await page.getByRole('button',{name:'Chọn mô hình',exact:true}).click();
    await expect(page.locator('.model-choice')).toHaveCount(5);
    await expect(page.locator('.model-picker')).not.toContainText('Superbike');
    await expect(page.locator('.model-picker')).not.toContainText('Drone camera');
    await page.getByRole('button',{name:`Mở ${name}`,exact:true}).click();
    await expect(page.getByText('Mô hình sẵn sàng',{exact:true})).toBeVisible({timeout:15000});
    await expect(page.getByRole('button',{name:'Tùy biến',exact:true}).first()).toBeVisible();
    if(!await page.locator('.structure-details').evaluate(el=>(el as HTMLDetailsElement).open))await page.locator('.structure-details>summary').click();
    await page.locator('.assembly-tree').getByRole('button',{name:new RegExp(slot.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).click();
    await expect(page.locator('.part-card')).toHaveCount(expectedCount);
    const old=await page.locator('.inspector-content h2').textContent();
    const before=await page.evaluate(()=>[...(window as any).__modScene.mounted.values()].map((m:any)=>m.group.position.toArray()));
    await page.getByRole('button',{name:`Xem thử ${variant.toLowerCase()}`,exact:true}).click();
    await expect(page.locator('.inspector-content h2')).toHaveText(variant);
    await expect(page.locator('.part-properties')).toContainText('Xem thử · chưa lắp');
    await page.getByRole('button',{name:'Hủy xem thử',exact:true}).click();
    await expect(page.locator('.inspector-content h2')).toHaveText(old!);
    await page.getByRole('button',{name:`Xem thử ${variant.toLowerCase()}`,exact:true}).click();
    await page.getByRole('button',{name:'Lắp linh kiện',exact:true}).click();
    await expect(page.locator('.part-card.chosen')).toContainText('ĐÃ LẮP');
    await expect.poll(()=>page.evaluate(()=>{const s=(window as any).__modScene;return s.mounted.get(s.state.selected)?.id===s.state.moduleConfig[s.state.selected];})).toBe(true);
    await page.getByRole('button',{name:'Bung mô hình',exact:true}).click();await page.waitForTimeout(450);
    await page.getByRole('button',{name:'Khám phá',exact:true}).click();await page.waitForTimeout(450);
    expect(await page.evaluate(()=>{const s=(window as any).__modScene;return [...s.mounted.values()].every((m:any)=>m.group.position.distanceTo(m.target)<.02);})).toBe(true);
    await page.locator('.assembly-tree').getByRole('button',{name:new RegExp(slot)}).click();
    await page.getByRole('button',{name:'Tháo linh kiện',exact:true}).click();
    await expect(page.locator('.inspector-content h2')).toHaveText('Vị trí đang trống');
    await page.getByRole('button',{name:'Tùy biến',exact:true}).first().click();
    await page.getByRole('button',{name:`Xem thử ${variant.toLowerCase()}`,exact:true}).click();
    await page.getByRole('button',{name:'Lắp linh kiện',exact:true}).click();
    await page.getByRole('button',{name:'Đóng danh sách linh kiện',exact:true}).click();
    await page.getByRole('button',{name:'Bung mô hình',exact:true}).click();await page.waitForTimeout(450);
    await page.screenshot({path:`test-results/modular-${name}.png`});
  }
  await page.getByRole('button',{name:'Chọn mô hình',exact:true}).click();
  await page.getByRole('button',{name:'Mở Ô tô City',exact:true}).click();
  await expect(page.getByText('Mô hình sẵn sàng',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Chọn bánh trước trái',exact:true}).click({timeout:10000});
  await expect(page.locator('.inspector-content h2')).toHaveText('Bánh thể thao');
  await page.reload();await expect(page.getByText('Xưởng tàu sẵn sàng')).toBeVisible();
  await page.getByRole('button',{name:'Chọn mô hình',exact:true}).click();await page.getByRole('button',{name:'Mở Ô tô City',exact:true}).click();
  await expect(page.getByText('Mô hình sẵn sàng',{exact:true})).toBeVisible();
  await page.locator('.structure-details>summary').click();await page.locator('.assembly-tree').getByRole('button',{name:/Bánh trước trái/}).click();
  await expect(page.locator('.inspector-content h2')).toHaveText('Bánh thể thao');
  expect(errors).toEqual([]);
});

test('mobile library has five models and configuration stays within viewport',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.getByText('Xưởng tàu sẵn sàng')).toBeVisible({timeout:15000});
  await page.getByRole('button',{name:'Chọn mô hình',exact:true}).click();await expect(page.locator('.model-choice')).toHaveCount(5);
  await page.getByRole('button',{name:'Mở Mech Line',exact:true}).click();await expect(page.getByText('Mô hình sẵn sàng',{exact:true})).toBeVisible({timeout:15000});
  await page.getByRole('button',{name:'Tùy biến',exact:true}).first().click();await expect(page.locator('.part-card')).toHaveCount(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/modular-mobile.png'});
});

test('modular configuration export/import restores removed parts and rejects a different model',async({page})=>{
  await page.goto('/');await expect(page.getByText('Xưởng tàu sẵn sàng')).toBeVisible({timeout:15000});
  await page.getByRole('button',{name:'Chọn mô hình',exact:true}).click();await page.getByRole('button',{name:'Mở Mech Line',exact:true}).click();
  await expect(page.getByText('Mô hình sẵn sàng',{exact:true})).toBeVisible({timeout:15000});
  await page.getByRole('button',{name:'Tùy biến',exact:true}).first().click();
  await page.getByRole('button',{name:'Xem thử khung bánh xích',exact:true}).click();await page.getByRole('button',{name:'Lắp linh kiện',exact:true}).click();
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Xuất',exact:true}).click();
  const download=await downloading,data=JSON.parse(await fs.readFile((await download.path())!,'utf8'));
  expect(data.model).toBe('line-mech');expect(data.parts['assembly:legs']).toContain('26829');
  await page.getByRole('button',{name:'Tháo linh kiện',exact:true}).click();await expect(page.locator('.inspector-content h2')).toHaveText('Vị trí đang trống');
  await page.getByLabel('File cấu hình JSON').setInputFiles({name:'mech.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await expect(page.locator('.inspector-content h2')).toHaveText('Khung bánh xích');
  await page.getByRole('button',{name:'Chọn mô hình',exact:true}).click();await page.getByRole('button',{name:'Mở Carbine',exact:true}).click();
  await expect(page.getByText('Mô hình sẵn sàng',{exact:true})).toBeVisible({timeout:15000});
  await page.getByLabel('File cấu hình JSON').setInputFiles({name:'wrong-model.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
  await expect(page.getByText('Hãy chọn đúng mô hình trước khi nhập.',{exact:true})).toBeVisible();
});
