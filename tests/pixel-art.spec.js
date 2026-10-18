import {test,expect,chromium} from '@playwright/test';
import {traceImage,tracePathData} from '../src/image-tracing.js';

test('pixel art averages cells, preserves aspect ratio and emits only square corners',()=>{
  const width=64,height=32,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set(x<32?[255,0,0,255]:[0,0,255,255],(y*width+x)*4);
  const result=traceImage({data,width,height},{mode:'pixel',pixelSize:16,colors:2});
  expect([result.width,result.height]).toEqual([16,8]);expect(result.shapes.map(s=>s.fill).sort()).toEqual(['#0000ff','#ff0000']);
  expect(result.selection.every(Boolean)).toBe(true);
  for(const shape of result.shapes){expect(tracePathData(shape.contours)).not.toContain('C');for(const loop of shape.contours)expect(loop).toHaveLength(4);}
  data.fill(0);expect(traceImage({data,width,height},{mode:'pixel'}).shapes).toHaveLength(0);
  for(let i=0;i<data.length;i+=4)data.set([255,255,255,255],i);
  expect(traceImage({data,width,height},{mode:'pixel'}).shapes).toHaveLength(0);
  expect(traceImage({data,width,height},{mode:'pixel',ignoreWhite:false}).shapes[0].fill).toBe('#ffffff');
});

test('pixel mode previews, switches controls, applies and resets in the trace dialog',async()=>{
  const browser=await chromium.launch({channel:'chrome'});
  try{
    const page=await browser.newPage();await page.goto('/');
    const png=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=80;canvas.height=40;
      const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,40,40);ctx.fillStyle='blue';ctx.fillRect(40,0,40,40);
      return canvas.toDataURL().split(',')[1];
    });
    await page.locator('#image-file').setInputFiles({name:'pixels.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.locator('#trace-image').click();
    await page.locator('#trace-mode').selectOption('pixel');await page.locator('#trace-pixel').selectOption('16');
    await expect(page.locator('#trace-status')).toContainText('16 × 8 pixels');
    await expect(page.locator('#trace-smoothing-control')).toBeHidden();await expect(page.locator('#trace-colors-control')).toBeVisible();
    await expect(page.locator('#trace-apply')).toBeEnabled();await page.locator('#trace-apply').click();
    await expect(page.locator('#trace-dialog')).not.toBeVisible();
    await expect(page.locator('#status')).toContainText('editable paths');
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab')));
    expect(JSON.stringify(saved)).toContain('CompoundPath');
    await page.locator('#undo').click();await page.keyboard.press('Control+a');
    await page.locator('#trace-image').click();await expect(page.locator('#trace-mode')).toHaveValue('mono');await page.locator('#trace-cancel').click();
  }finally{await browser.close();}
});
