import {rotateSelection, useCropTool} from './helpers/canvas-transforms.js';
import {test,expect} from '@playwright/test';
import {sourcePixelScale} from '../src/image-resolution.js';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});
const saved=page=>page.evaluate(()=>localStorage.getItem('vector-lab'));
async function file(page,width=2400,height=1600){
 const base64=await page.evaluate(({width,height})=>{const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,width,height);x.fillStyle='black';for(let i=0;i<width;i+=2)x.fillRect(i,0,1,height);return c.toDataURL().split(',')[1];},{width,height});
 return {name:'scan.png',mimeType:'image/png',buffer:Buffer.from(base64,'base64')};
}
async function insert(page){await page.goto('/');await page.locator('#image-file').setInputFiles(await file(page));await expect(page.locator('#status')).toContainText('Image inserted');}
async function openExport(page,editable=false){await page.locator('#file-menu-button').click();await page.locator(editable?'#export-editable-png':'#export-png').click();await expect(page.locator('#download-png')).toBeEnabled();}
async function download(page){const waiting=page.waitForEvent('download');await page.locator('#download-png').click();return Buffer.concat(await(await(await waiting).createReadStream()).toArray());}
async function state(page){return page.evaluate(async()=>{
 const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),item=paper.project.layers[1].children[0],r=item.getItems({class:paper.Raster})[0],m=r.globalMatrix;
 return {scaleX:Math.hypot(m.a,m.b),scaleY:Math.hypot(m.c,m.d),angle:Math.atan2(m.b,m.a),det:m.a*m.d-m.b*m.c,center:[item.bounds.center.x,item.bounds.center.y],width:item.bounds.width,height:item.bounds.height,data:item.data,source:r.source,page:paper.project.layers[1].data.page};
});}

test('source pixel density accounts for rotation, mirroring and shear',()=>{
 expect(sourcePixelScale({a:0,b:.25,c:-.25,d:0})).toBeCloseTo(.25,10);
 expect(sourcePixelScale({a:-.5,b:0,c:0,d:.25})).toBeCloseTo(.25,10);
 expect(sourcePixelScale({a:1,b:0,c:1,d:1})).toBeCloseTo((Math.sqrt(5)-1)/2,10);
 expect(sourcePixelScale({a:0,b:0,c:0,d:0})).toBe(0);
});

test('fit-to-page scan can export at source resolution without resizing the drawing or losing pixel detail',async({page},testInfo)=>{
 await insert(page);const before=await saved(page);expect((await state(page)).scaleX).toBeLessThan(1);
 await openExport(page);await expect(page.locator('#png-export-width')).toHaveValue('1056');await expect(page.locator('#png-export-height')).toHaveValue('816');
 await page.locator('#png-image-resolution').click();await expect(page.locator('#png-export-selected')).toBeChecked();await expect(page.locator('#png-export-width')).toHaveValue('2400');await expect(page.locator('#png-export-height')).toHaveValue('1600');
 await page.screenshot({path:testInfo.outputPath('scan-export.png')});const bytes=await download(page);expect([bytes.readUInt32BE(16),bytes.readUInt32BE(20)]).toEqual([2400,1600]);
 const pixels=await page.evaluate(async b64=>{const image=await createImageBitmap(await(await fetch('data:image/png;base64,'+b64)).blob()),c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);return [...x.getImageData(100,100,2,1).data];},bytes.toString('base64'));
 expect(pixels).toEqual([0,0,0,255,255,255,255,255]);expect(await saved(page)).toBe(before);
});

for(const rotate of [false,true])test(`image resolution exports the visible crop including rotation (${rotate})`,async({page})=>{
 await insert(page);await useCropTool(page);await page.locator('#image-crop summary').click();await page.locator('#crop-left').fill('25');await page.locator('#apply-crop').click();if(rotate)await rotateSelection(page);
 const before=await saved(page);await openExport(page);await page.locator('#png-image-resolution').click();const bytes=await download(page);
 const a=rotate?Math.PI/12:0;expect([bytes.readUInt32BE(16),bytes.readUInt32BE(20)]).toEqual([Math.round(1800*Math.cos(a)+1600*Math.sin(a)),Math.round(1800*Math.sin(a)+1600*Math.cos(a))]);expect(await saved(page)).toBe(before);
 if(rotate){const alpha=await page.evaluate(async b64=>{const image=await createImageBitmap(await(await fetch('data:image/png;base64,'+b64)).blob()),c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);return x.getImageData(0,0,1,1).data[3];},bytes.toString('base64'));expect(alpha).toBe(0);}
});

test('Original pixel size keeps crop, rotation, mirroring and pixels through undo, recovery and SVG reopening',async({page})=>{
 await insert(page);await useCropTool(page);await page.locator('#image-crop summary').click();await page.locator('#crop-left').fill('25');await page.locator('#apply-crop').click();await rotateSelection(page);await page.locator('#flip-horizontal').click();
 const before=await saved(page),old=await state(page);await page.locator('#original-pixel-size').click();const after=await saved(page),restored=await state(page);
 expect(restored.scaleX).toBeCloseTo(1,10);expect(restored.scaleY).toBeCloseTo(1,10);expect(restored.angle).toBeCloseTo(old.angle,10);expect(restored.det).toBeLessThan(0);expect(restored.data).toEqual(old.data);expect(restored.source).toBe(old.source);expect(restored.center[0]).toBeCloseTo(old.center[0],6);expect(restored.center[1]).toBeCloseTo(old.center[1],6);
 await page.locator('#canvas-undo').click();expect(await saved(page)).toBe(before);await page.locator('#canvas-redo').click();expect(await saved(page)).toBe(after);await page.reload();expect(await saved(page)).toBe(after);
 await page.locator('#save').click();await expect(page.locator('#download-svg')).toBeEnabled();const waiting=page.waitForEvent('download');await page.locator('#download-svg').click();const svg=Buffer.concat(await(await(await waiting).createReadStream()).toArray());
 page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'restored.svg',mimeType:'image/svg+xml',buffer:svg});await expect(page.locator('#status')).toContainText('SVG opened');const reopened=await state(page);expect(reopened.scaleX).toBeCloseTo(1,7);expect(reopened.scaleY).toBeCloseTo(1,7);expect(reopened.det).toBeLessThan(0);expect(reopened.data.crop).toEqual(old.data.crop);
});

test('original-pixel import is optional and the next ordinary insert still fits to page',async({page},testInfo)=>{
 await page.goto('/');const image=await file(page);await page.locator('#image-import-size-toggle').click();await page.screenshot({path:testInfo.outputPath('import-size-menu.png')});
 const choosing=page.waitForEvent('filechooser');await page.locator('#import-image-original').click();await(await choosing).setFiles(image);await expect(page.locator('#status')).toContainText('original pixel size');expect((await state(page)).scaleX).toBeCloseTo(1,10);
 const next=page.waitForEvent('filechooser');await page.locator('#insert-image').click();await(await next).setFiles(image);await expect(page.locator('#status')).toContainText('Image inserted. Crop controls');
 const scales=await page.evaluate(async()=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name);return paper.project.layers[1].children.map(i=>i.getItems({class:paper.Raster})[0].globalMatrix.a);});expect(scales[0]).toBeCloseTo(1,10);expect(scales[1]).toBeLessThan(1);
});

for(const editable of [false,true])test(`custom PNG size stays proportional and preserves editable document size (${editable})`,async({page})=>{
 await insert(page);const before=await saved(page);await openExport(page,editable);await page.locator('#png-export-width').fill('2112');await expect(page.locator('#png-export-height')).toHaveValue('1632');
 await page.locator('#png-export-height').fill('408');await expect(page.locator('#png-export-width')).toHaveValue('528');const bytes=await download(page);expect([bytes.readUInt32BE(16),bytes.readUInt32BE(20)]).toEqual([528,408]);expect(await saved(page)).toBe(before);
 if(editable){const dimensions=await page.evaluate(async b64=>{const {readEditableSVG}=await import('/src/editable-png.js'),svg=await readEditableSVG(await(await fetch('data:image/png;base64,'+b64)).blob());return new DOMParser().parseFromString(svg,'image/svg+xml').documentElement.getAttribute('viewBox');},bytes.toString('base64'));expect(dimensions).toBe('0 0 1056 816');}
});

test('PNG export rejects invalid and excessive output sizes and remains usable on a phone',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});await insert(page);await openExport(page);
 await page.locator('#png-export-width').fill('');await page.locator('#download-png').click();await expect(page.locator('#png-export-status')).toContainText('positive whole-pixel');
 await page.locator('#png-export-width').fill('20000');await page.locator('#download-png').click();await expect(page.locator('#png-export-status')).toContainText('too large');
 await page.locator('#png-export-width').fill('8000');await page.locator('#download-png').click();await expect(page.locator('#png-export-status')).toContainText('32 million');
 await page.locator('#png-document-size').click();await expect(page.locator('#png-export-width')).toHaveValue('1056');
 expect(await page.locator('#png-export-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('phone-export.png')});await page.locator('#download-png').click();await expect(page.locator('#png-export-dialog')).toBeHidden();
});
