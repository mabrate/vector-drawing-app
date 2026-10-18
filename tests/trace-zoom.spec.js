import {test,expect,chromium} from '@playwright/test';

test('trace zoom syncs previews, pans, preserves brush coordinates and fits again',async()=>{
  const browser=await chromium.launch({channel:'chrome'});
  try{
    const page=await browser.newPage();await page.goto('/');
    const png=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=200;canvas.height=100;
      const ctx=canvas.getContext('2d');ctx.fillRect(0,0,200,100);return canvas.toDataURL().split(',')[1];
    });
    await page.locator('#image-file').setInputFiles({name:'zoom.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.locator('#trace-image').click();await expect(page.locator('#trace-apply')).toBeEnabled();
    const original=page.locator('#trace-original'),result=page.locator('#trace-result svg');
    const before=await original.boundingBox();
    await page.locator('#trace-zoom-in').click();await page.locator('#trace-zoom-in').click();
    await expect(page.locator('#trace-zoom-value')).toHaveText('225%');
    const enlarged=await original.boundingBox(),vector=await result.boundingBox();
    expect(enlarged.width/before.width).toBeCloseTo(2.25,1);expect(vector.width).toBeCloseTo(enlarged.width,0);
    const viewport=await page.locator('#trace-result').boundingBox();
    await page.mouse.move(viewport.x+viewport.width/2,viewport.y+viewport.height/2);await page.mouse.down();await page.mouse.move(viewport.x+viewport.width/2+30,viewport.y+viewport.height/2);await page.mouse.up();
    expect((await result.boundingBox()).x-vector.x).toBeCloseTo(30,0);
    await page.locator('#trace-brush-mode').selectOption('exclude');
    const bounds=await original.boundingBox();const parent=await original.locator('..').boundingBox();
    const x=parent.x+parent.width/2,y=parent.y+parent.height/2;
    const dimensions=await original.evaluate(canvas=>({width:canvas.width,height:canvas.height}));
    const pixel={x:Math.floor((x-bounds.x)*dimensions.width/bounds.width),y:Math.floor((y-bounds.y)*dimensions.height/bounds.height)};
    await page.mouse.click(x,y);await expect(page.locator('#trace-status')).toContainText('Manual corrections applied');
    expect(await original.evaluate((canvas,p)=>canvas.getContext('2d').getImageData(p.x,p.y,1,1).data[0],pixel)).toBeGreaterThan(100);
    await expect(page.locator('#trace-zoom-value')).toHaveText('225%');
    await page.locator('#trace-zoom-fit').click();await expect(page.locator('#trace-zoom-value')).toHaveText('100%');expect((await original.boundingBox()).width).toBeCloseTo(before.width,0);
    await page.locator('#trace-brush-mode').selectOption('view');await page.mouse.move(x,y);await page.mouse.wheel(0,-300);await expect(page.locator('#trace-zoom-value')).not.toHaveText('100%');
    await page.locator('#trace-cancel').click();await page.locator('#trace-image').click();await expect(page.locator('#trace-zoom-value')).toHaveText('100%');
    await page.setViewportSize({width:390,height:844});await expect(page.locator('#trace-zoom-fit')).toBeVisible();
  }finally{await browser.close();}
});
