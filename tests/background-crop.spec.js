import {test,expect,chromium} from '@playwright/test';
import {alphaBounds} from '../src/alpha-bounds.js';

test('alpha bounds include faint edges and handle empty and fully opaque images',()=>{
 const width=5,height=4,data=new Uint8ClampedArray(width*height*4);
 expect(alphaBounds({data,width,height})).toBeNull();
 data[(1*width+2)*4+3]=1;data[(2*width+3)*4+3]=255;
 expect(alphaBounds({data,width,height})).toEqual({left:2,top:1,right:4,bottom:3});
 data.fill(255);expect(alphaBounds({data,width,height})).toEqual({left:0,top:0,right:5,bottom:4});
});

test('background removal crops edges without moving rotated artwork and supports reset, undo and SVG recovery',async()=>{
 const browser=await chromium.launch({channel:'chrome'});
 try{
 const page=await browser.newPage();await page.goto('/');
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=200;c.height=100;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,200,100);ctx.fillStyle='red';ctx.fillRect(60,20,80,60);return c.toDataURL().split(',')[1];});
 await page.locator('#image-file').setInputFiles({name:'subject.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await expect(page.locator('#status')).toContainText('Image inserted');
 await page.locator('#rotate').click();
 const snapshot=()=>page.evaluate(()=>localStorage.getItem('vector-lab'));
 const before=await snapshot(),original=JSON.parse(before)[1].children[0][1];
 async function output(){await page.locator('#save').click();await expect(page.locator('#download-svg')).toBeEnabled();const downloading=page.waitForEvent('download');await page.locator('#download-svg').click();return Buffer.concat(await(await(await downloading).createReadStream()).toArray()).toString();}
 async function ink(svg){return page.evaluate(async svg=>{const image=new Image();image.src=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);URL.revokeObjectURL(image.src);const {data}=ctx.getImageData(0,0,c.width,c.height);let left=c.width,top=c.height,right=0,bottom=0;for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4;if(data[i]>240&&data[i+1]<10&&data[i+2]<10&&data[i+3]>240){left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x);bottom=Math.max(bottom,y);}}return [left,top,right,bottom];},svg);}
 const originalInk=await ink(await output());
 await page.locator('#remove-background').click();await page.locator('#background-edges').click();await page.locator('#background-apply').click();await expect(page.locator('#status')).toContainText('empty edges cropped');
 const cropped=await snapshot(),item=JSON.parse(cropped)[1].children[0][1];expect(item.matrix).toEqual(original.matrix);expect(item.children[1][1].matrix).toEqual(original.children[1][1].matrix);
 expect(item.data.crop).toEqual({left:30,right:30,top:20,bottom:20});
 const svg=await output();expect(await ink(svg)).toEqual(originalInk);
 await page.locator('#undo').click();expect(await snapshot()).toBe(before);
 await page.locator('#redo').click();await page.reload();expect(JSON.parse(await snapshot())[1].children[0][1].data.crop).toEqual(item.data.crop);
 page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'cropped.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await expect(page.locator('#status')).toContainText('SVG opened');expect(await ink(await output())).toEqual(originalInk);
 await page.keyboard.press('Control+a');await page.locator('#image-crop summary').click();await page.locator('#reset-crop').click();
 await expect(page.locator('#crop-left')).toHaveValue('0');expect(await ink(await output())).toEqual(originalInk);
 }finally{await browser.close();}
});
