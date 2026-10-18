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
      const canvas=document.createElement('canvas');canvas.width=160;canvas.height=80;
      const ctx=canvas.getContext('2d');ctx.fillStyle='red';ctx.fillRect(0,0,80,80);ctx.fillStyle='blue';ctx.fillRect(80,0,80,80);
      return canvas.toDataURL().split(',')[1];
    });
    await page.locator('#image-file').setInputFiles({name:'pixels.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    await page.locator('#trace-image').click();
    await page.locator('#trace-mode').selectOption('pixel');await page.locator('#trace-pixel').selectOption('16');
    await expect(page.locator('#trace-status')).toContainText('16 × 8 pixels');
    await page.locator('#trace-pixel').selectOption('128');
    await expect(page.locator('#trace-status')).toContainText('128 × 64 pixels');
    await expect(page.locator('#trace-smoothing-control')).toBeHidden();await expect(page.locator('#trace-colors-control')).toBeVisible();
    await expect(page.locator('#trace-apply')).toBeEnabled();await page.locator('#trace-apply').click();
    await expect(page.locator('#trace-dialog')).not.toBeVisible();
    await expect(page.locator('#status')).toContainText('editable paths');
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab')));
    expect(JSON.stringify(saved)).toContain('CompoundPath');
    // Grid detail must not become the SVG's size or preserve canvas offsets.
    await page.locator('#save').click();await page.locator('#export-selected').check();
    await expect(page.locator('#download-svg')).toBeEnabled();
    const downloading=page.waitForEvent('download');await page.locator('#download-svg').click();const download=await downloading;
    const svg=Buffer.concat(await(await download.createReadStream()).toArray()).toString();
    const dimensions=await page.evaluate(async svg=>{
      const root=new DOMParser().parseFromString(svg,'image/svg+xml').documentElement;
      document.body.append(root);const b=root.getBBox();root.remove();
      return {width:root.getAttribute('width'),height:root.getAttribute('height'),viewBox:root.getAttribute('viewBox').split(' ').map(Number),bounds:[b.x,b.y,b.width,b.height]};
    },svg);
    expect(Number(dimensions.width)).toBeCloseTo(160);expect(Number(dimensions.height)).toBeCloseTo(80);
    expect(dimensions.viewBox[0]).toBe(0);expect(dimensions.viewBox[1]).toBe(0);
    for(let i=0;i<4;i++)expect(dimensions.bounds[i]).toBeCloseTo([0,0,160,80][i]);

    await page.locator('#undo').click();await page.keyboard.press('Control+a');
    await page.locator('#trace-image').click();await expect(page.locator('#trace-mode')).toHaveValue('mono');await page.locator('#trace-cancel').click();
  }finally{await browser.close();}
});
