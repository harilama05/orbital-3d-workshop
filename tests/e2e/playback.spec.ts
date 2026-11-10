import {test,expect} from '@playwright/test';

test('all source motions remain selectable and replacing an animated attachment keeps its binding',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByText('Xưởng tàu sẵn sàng')).toBeVisible({timeout:15000});
  await page.evaluate(async()=>{
    const url=performance.getEntriesByType('resource').find(e=>/\/src\/scene\.ts(?:\?|$)/.test(e.name))?.name??'/src/scene.ts';const {WorkshopScene}=await import(/* @vite-ignore */url),original=WorkshopScene.prototype.setMarkers;
    WorkshopScene.prototype.setMarkers=function(...args:any[]){(window as any).__motionScene=this;return original.apply(this,args);};
  });
  for(const [model,clips]of [['Ô tô City',['wheel-roll']],['Carbine',['stock-open','stock-close','magazine-open','magazine-close','charge-open','charge-close']],['Pistol',['slide-open','slide-close','magazine-open','magazine-close','cock']]] as const){
    await page.getByRole('button',{name:'Chọn mô hình',exact:true}).click();await page.getByRole('button',{name:`Mở ${model}`,exact:true}).click();
    await expect(page.getByText('Mô hình sẵn sàng',{exact:true})).toBeVisible({timeout:15000});
    await expect(page.getByRole('combobox',{name:'Chọn chuyển động'}).locator('option')).toHaveCount(clips.length+1);
    for(const clip of clips){
      await page.getByRole('combobox',{name:'Chọn chuyển động'}).selectOption(clip);
      const before=await page.evaluate(()=>[...(window as any).__motionScene.mounted.values()].map((m:any)=>[...m.motion.position.toArray(),...m.motion.quaternion.toArray()]));
      await page.waitForTimeout(150);
      const after=await page.evaluate(()=>[...(window as any).__motionScene.mounted.values()].map((m:any)=>[...m.motion.position.toArray(),...m.motion.quaternion.toArray()]));
      expect(after.some((row:number[],i:number)=>row.some((v,j)=>Math.abs(v-before[i][j])>.0001))).toBe(true);
      await page.getByRole('button',{name:'Tạm dừng chuyển động',exact:true}).click();
      const held=await page.evaluate(()=>(window as any).__motionScene.action.time);await page.waitForTimeout(100);
      expect(await page.evaluate(()=>(window as any).__motionScene.action.time)).toBe(held);
      await page.getByRole('button',{name:'Về tư thế gốc',exact:true}).click();
    }
  }
  // The pistol optic is attached to the moving slide, including replacement optics.
  await page.locator('.structure-details>summary').click();await page.locator('.assembly-tree').getByRole('button',{name:/Ống ngắm/}).click();
  await page.getByRole('button',{name:'Xem thử ngắm holo',exact:true}).click();await page.getByRole('button',{name:'Lắp linh kiện',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__motionScene.mounted.get('assembly:optic')?.id.includes('33366'))).toBe(true);
  await page.getByRole('combobox',{name:'Chọn chuyển động'}).selectOption('slide-open');
  await page.waitForTimeout(100);
  expect(await page.evaluate(()=>Math.abs((window as any).__motionScene.mounted.get('assembly:optic').motion.position.z))).toBeGreaterThan(.001);
  await page.getByRole('button',{name:'Đóng danh sách linh kiện',exact:true}).click();
  await page.getByRole('button',{name:'Xem riêng bộ phận',exact:true}).click();await expect(page.locator('.view-badge')).toHaveText('ISOLATED');
  await page.screenshot({path:'test-results/modular-animated-optic.png'});expect(errors).toEqual([]);
});

test('play once holds the last pose and can restart',async({page})=>{
  await page.goto('/');await expect(page.getByText('Xưởng tàu sẵn sàng')).toBeVisible({timeout:15000});
  await page.getByRole('button',{name:'Chọn mô hình',exact:true}).click();await page.getByRole('button',{name:'Mở Ô tô City',exact:true}).click();
  await expect(page.getByText('Mô hình sẵn sàng',{exact:true})).toBeVisible({timeout:15000});
  await page.getByRole('button',{name:'Lặp chuyển động',exact:true}).click();await page.getByRole('combobox',{name:'Chọn chuyển động'}).selectOption('wheel-roll');
  await expect(page.getByRole('button',{name:'Chạy chuyển động',exact:true})).toBeVisible({timeout:7000});
  await page.getByRole('button',{name:'Chạy chuyển động',exact:true}).click();await expect(page.getByRole('button',{name:'Tạm dừng chuyển động',exact:true})).toBeVisible();
});
