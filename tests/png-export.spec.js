import {test,expect,chromium} from '@playwright/test';

test('File exports a named page-sized PNG with transparency, images, text and no overlays',async()=>{
  const browser=await chromium.launch({channel:'chrome'});
  try{
    const page=await browser.newPage();await page.goto('/');
    const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=4;const x=c.getContext('2d');x.fillStyle='blue';x.fillRect(0,0,4,4);return c.toDataURL();});
    page.once('dialog',dialog=>dialog.accept());
    await page.locator('#file').setInputFiles({name:'my-art.svg',mimeType:'image/svg+xml',buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80" viewBox="0 0 120 80"><path d="M-10 5H30V30H-10Z" fill="red"/><image xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="${image}" x="40" y="5" width="20" height="20"/><text x="10" y="65" font-family="Arimo" font-size="20">Hi</text></svg>`)});
    await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');
    const recovery=await page.evaluate(()=>localStorage.getItem('vector-lab'));
    await page.locator('#file-menu-button').click();const downloading=page.waitForEvent('download');await page.locator('#export-png').click();await page.locator('#download-png').click();const file=await downloading;
    expect(file.suggestedFilename()).toBe('my-art.png');const bytes=Buffer.concat(await(await file.createReadStream()).toArray());
    expect(bytes.subarray(0,8).toString('hex')).toBe('89504e470d0a1a0a');
    const pixels=await page.evaluate(async base64=>{
      const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const context=canvas.getContext('2d');context.drawImage(image,0,0);
      const at=(x,y)=>Array.from(context.getImageData(x,y,1,1).data);let textPixels=0;for(let y=40;y<70;y++)for(let x=8;x<40;x++)if(at(x,y)[3]>100)textPixels++;
      return {width:image.width,height:image.height,red:at(1,10),blue:at(50,15),empty:at(100,70),textPixels};
    },bytes.toString('base64'));
    expect(pixels.width).toBe(120);expect(pixels.height).toBe(80);expect(pixels.red).toEqual([255,0,0,255]);expect(pixels.blue).toEqual([0,0,255,255]);expect(pixels.empty[3]).toBe(0);expect(pixels.textPixels).toBeGreaterThan(20);
    expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(recovery);await expect(page.locator('#file-menu')).toBeHidden();
  }finally{await browser.close();}
});

test('PNG export reports oversized pages without allocating a huge canvas',async()=>{
  const browser=await chromium.launch({channel:'chrome'});
  try{const page=await browser.newPage();await page.goto('/');
    const message=await page.evaluate(async()=>{const {createPNG}=await import('/src/png-export.js');try{await createPNG('<svg xmlns="http://www.w3.org/2000/svg"/>',100000,100000);}catch(error){return error.message;}});
    expect(message).toContain('too large');
  }finally{await browser.close();}
});
