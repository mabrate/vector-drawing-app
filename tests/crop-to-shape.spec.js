import {test,expect} from '@playwright/test';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});
async function output(page){await page.locator('#save').click();const wait=page.waitForEvent('download');await page.locator('#download-svg').click();return Buffer.concat(await(await(await wait).createReadStream()).toArray()).toString();}
async function open(page,svg){page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'crop.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await expect(page.locator('#status')).toContainText('SVG opened');}
async function setup(page,overlap=true){
 await page.goto('/');const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=100;const ctx=c.getContext('2d');ctx.fillStyle='blue';ctx.fillRect(0,0,200,100);return c.toDataURL().split(',')[1];});
 await page.locator('#image-file').setInputFiles({name:'blue.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await expect(page.locator('#status')).toContainText('Image inserted');await page.locator('#rotate').click();
 const svg=await output(page);await open(page,svg.replace('</svg>',`<circle cx="${overlap?528:100}" cy="408" r="30" fill="red"/></svg>`));await page.keyboard.press('Control+a');
}
async function pixels(page,svg){return page.evaluate(async svg=>{const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();const c=document.createElement('canvas');c.width=1056;c.height=816;const ctx=c.getContext('2d');ctx.drawImage(image,0,0,1056,816);return [ctx.getImageData(528,408,1,1).data[3],ctx.getImageData(570,408,1,1).data[3]];},svg);}
test('crop to drawn shape preserves pixels, undo, recovery and SVG reopening',async({page})=>{
 await setup(page);await page.locator('[data-boolean=intersect]').click();await expect(page.locator('#status')).toContainText('Image clipped to shape');
 const svg=await output(page);expect(svg).toContain('intersections');expect(await pixels(page,svg)).toEqual([255,0]);
 await page.locator('#undo').click();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children.length)).toBe(2);await page.locator('#redo').click();await page.reload();expect(await pixels(page,await output(page))).toEqual([255,0]);
 await open(page,svg);await page.keyboard.press('Control+a');await page.locator('#image-crop summary').click();await page.locator('#reset-crop').click();expect(await pixels(page,await output(page))).toEqual([255,0]);
});
test('crop to shape keeps originals when there is no overlap',async({page})=>{
 await setup(page,false);const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));await page.locator('[data-boolean=intersect]').click();await expect(page.locator('#status')).toContainText('does not overlap');expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
});
