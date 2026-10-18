import {test,expect,chromium} from '@playwright/test';
import {traceImage,tracePathData} from '../src/image-tracing.js';

test('pixel art averages cells, preserves aspect ratio and emits only square corners',()=>{
  const width=64,height=32,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set(x<32?[255,0,0,255]:[0,0,255,255],(y*width+x)*4);
  const result=traceImage({data,width,height},{mode:'pixel',pixelSize:16,colors:2});
  expect([result.gridWidth,result.gridHeight]).toEqual([16,8]);expect(result.shapes.map(s=>s.fill).sort()).toEqual(['#0000ff','#ff0000']);
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
    await page.locator('#trace-pixel-sizing').selectOption('block');await page.locator('#trace-block').fill('8');
    await expect(page.locator('#trace-pixel-control')).toBeHidden();
    await expect(page.locator('#trace-status')).toContainText('20 × 10 pixels');
    await page.locator('#trace-block').fill('0');await expect(page.locator('#trace-status')).toContainText('Choose a block size');await expect(page.locator('#trace-apply')).toBeDisabled();
    await page.locator('#trace-block').fill('8');await expect(page.locator('#trace-status')).toContainText('20 × 10 pixels');
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
    await page.locator('#trace-image').click();await expect(page.locator('#trace-mode')).toHaveValue('pixel');await expect(page.locator('#trace-block')).toHaveValue('8');await expect(page.locator('#trace-pixel-sizing')).toHaveValue('block');await page.locator('#trace-reset').click();await expect(page.locator('#trace-pixel-sizing')).toHaveValue('detail');await page.locator('#trace-cancel').click();
  }finally{await browser.close();}
});


test('block size is independent of source resolution and follows artwork dimensions',()=>{
  function trace(resolution,artworkWidth){
    const width=resolution,height=resolution/2,data=new Uint8ClampedArray(width*height*4);
    for(let i=0;i<data.length;i+=4)data.set([255,0,0,255],i);
    return traceImage({data,width,height},{mode:'pixel',pixelSizing:'block',blockSize:8,artworkWidth,artworkHeight:artworkWidth/2});
  }
  const small=trace(64,160),large=trace(256,160),bigger=trace(256,320);
  expect([small.gridWidth,small.gridHeight]).toEqual([20,10]);
  expect([large.gridWidth,large.gridHeight]).toEqual([20,10]);
  expect([bigger.gridWidth,bigger.gridHeight]).toEqual([40,20]);
  for(const result of [small,large,bigger]){
    const loop=result.shapes[0].contours[0];
    const physicalHeight=(loop[2][1]-loop[1][1])*(result===bigger?160:80)/result.height;
    expect(physicalHeight).toBeCloseTo(8);
  }
});

test('pixel grids fit transparent content while retaining its position, with partial edge blocks',()=>{
 const width=100,height=80,data=new Uint8ClampedArray(width*height*4);
 for(let y=20;y<53;y++)for(let x=10;x<59;x++)data.set([255,0,0,255],(y*width+x)*4);
 const image={data,width,height};
 const detail=traceImage(image,{mode:'pixel',pixelSize:16});expect([detail.gridWidth,detail.gridHeight]).toEqual([16,11]);
 const blocks=traceImage(image,{mode:'pixel',pixelSizing:'block',blockSize:8,artworkWidth:100,artworkHeight:80});
 expect([blocks.gridWidth,blocks.gridHeight]).toEqual([7,5]);
 const points=blocks.shapes.flatMap(shape=>shape.contours.flat());
 expect(Math.min(...points.map(p=>p[0]))).toBe(10);expect(Math.max(...points.map(p=>p[0]))).toBe(59);
 expect(Math.min(...points.map(p=>p[1]))).toBe(20);expect(Math.max(...points.map(p=>p[1]))).toBe(53);
 expect(blocks.selection.length).toBe(width*height);expect(blocks.selection[0]).toBe(0);expect(blocks.selection[20*width+10]).toBe(1);
 expect(()=>traceImage(image,{mode:'pixel',pixelSizing:'block',blockSize:1,artworkWidth:100000,artworkHeight:80000})).toThrow('larger block size');
 data.fill(0);expect(traceImage(image,{mode:'pixel',pixelSizing:'block'}).shapes).toHaveLength(0);
});
