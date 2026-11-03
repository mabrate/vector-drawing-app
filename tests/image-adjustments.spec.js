import {test,expect} from '@playwright/test';
import {adjustImage,defaultAdjustments} from '../src/image-adjustments.js';
import {readEditableSVG} from '../src/editable-png.js';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});

function process(pixels,settings={}){return Array.from(adjustImage({data:new Uint8ClampedArray(pixels.flat()),width:pixels.length,height:1},{...defaultAdjustments(),...settings}).data);}

test('image adjustments preserve neutral pixels, alpha and source data',()=>{
  const data=new Uint8ClampedArray([200,90,30,255,40,120,200,80,90,80,70,0]),original=data.slice();
  expect(adjustImage({data,width:3,height:1},defaultAdjustments()).data).toEqual(data);
  const result=adjustImage({data,width:3,height:1},{...defaultAdjustments(),exposure:1,contrast:35});
  expect(data).toEqual(original);expect([result.data[3],result.data[7],result.data[11]]).toEqual([255,80,0]);expect(result.data.slice(8)).toEqual(data.slice(8));
});

test('exposure, contrast, saturation and monochrome controls change image tones',()=>{
  const gray=[[64,64,64,255]],exposed=process(gray,{exposure:1});
  expect(exposed[0]).toBeGreaterThan(85);expect(exposed[0]).toBeLessThan(95);
  expect(process(gray,{contrast:50})[0]).toBeLessThan(64);
  expect(process(gray,{contrast:-100}).slice(0,3)).toEqual([128,128,128]);
  const color=[[190,100,60,255]],desaturated=process(color,{saturation:-100});expect(desaturated[0]).toBe(desaturated[1]);expect(desaturated[1]).toBe(desaturated[2]);
  expect(process(color,{saturation:100})[0]).toBeGreaterThan(190);
  const tones=[[60,90,120,64],[180,200,220,255]],grayOutput=process(tones,{mode:'gray'});
  expect(grayOutput[0]).toBe(grayOutput[1]);expect(grayOutput[1]).toBe(grayOutput[2]);expect(grayOutput[3]).toBe(64);
  expect(process(tones,{mode:'mono',threshold:128})).toEqual([0,0,0,64,255,255,255,255]);
  expect(process(tones,{mode:'mono',threshold:230})).toEqual([0,0,0,64,0,0,0,255]);
});

test('color ranges adjust selected hues smoothly and keep neutral colors neutral',()=>{
  const ranges=defaultAdjustments().ranges;ranges[0]={brightness:60,saturation:100};
  const pixels=[[180,100,100,255],[100,180,100,255],[128,128,128,255],[180,100,101,255],[180,101,100,255]],result=process(pixels,{ranges});
  expect(result[0]).toBeGreaterThan(180);expect(result.slice(4,8)).toEqual(pixels[1]);expect(result.slice(8,12)).toEqual(pixels[2]);
  expect(Math.abs(result[12]-result[16])).toBeLessThan(3);
  const gray=process(pixels,{ranges,mode:'gray'}),plain=process(pixels,{mode:'gray'});expect(gray[0]).toBeGreaterThan(plain[0]);expect(gray[4]).toBe(plain[4]);
  ranges[0].saturation=0;expect(process(pixels,{ranges,mode:'gray'})).toEqual(gray);
});

async function insert(page,width=240,height=120){
  await page.goto('/');
  const source=await page.evaluate(({width,height})=>{
    const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d');
    x.fillStyle='rgb(180,80,60)';x.fillRect(0,0,width/2,height);x.fillStyle='rgb(40,100,180)';x.fillRect(width/2,0,width/2,height);
    x.clearRect(0,0,10,10);x.clearRect(10,0,10,10);x.fillStyle='rgba(180,80,60,.5)';x.fillRect(10,0,10,10);return c.toDataURL();
  },{width,height});
  await page.locator('#image-file').setInputFiles({name:'colors.png',mimeType:'image/png',buffer:Buffer.from(source.split(',')[1],'base64')});
  await expect(page.locator('#status')).toContainText('Image inserted');return source;
}
const snapshot=page=>page.evaluate(()=>localStorage.getItem('vector-lab'));
async function setRange(page,id,value){await page.locator(`#adjust-${id}`).fill(String(value));}
async function ready(page){await expect(page.locator('#adjust-status')).toHaveText('Preview ready.');}
async function previewPixel(page,x=30,y=30){return page.locator('#adjust-canvas').evaluate((canvas,{x,y})=>Array.from(canvas.getContext('2d').getImageData(x,y,1,1).data),{x,y});}
function rasterRecord(json){const node=typeof json==='string'?JSON.parse(json):json;if(node[0]==='Raster')return node[1];for(const child of node[1]?.children||[]){const result=rasterRecord(child);if(result)return result;}return null;}
async function rasterPixels(page,source){return page.evaluate(async source=>{
  const image=new Image();image.src=source;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);
  return {width:c.width,height:c.height,pixels:[...x.getImageData(0,0,1,1).data,...x.getImageData(15,5,1,1).data,...x.getImageData(30,30,1,1).data,...x.getImageData(c.width-30,30,1,1).data]};
},source);}
async function exportSVG(page){await page.locator('#save').click();await expect(page.locator('#download-svg')).toBeEnabled();const waiting=page.waitForEvent('download');await page.locator('#download-svg').click();return Buffer.concat(await(await(await waiting).createReadStream()).toArray()).toString();}

test('adjust image previews original, remembers each range, and cancels without changing artwork',async({page},testInfo)=>{
  await insert(page);const before=await snapshot(page);
  await page.getByRole('button',{name:'Adjust image',exact:true}).click();await expect(page.locator('#adjust-apply')).toBeDisabled();
  await setRange(page,'exposure',1);await ready(page);expect((await previewPixel(page))[0]).toBeGreaterThan(180);expect(await snapshot(page)).toBe(before);
  await page.locator('#adjust-original').check();expect(await previewPixel(page)).toEqual([180,80,60,255]);
  await page.locator('#adjust-original').uncheck();await ready(page);expect((await previewPixel(page))[0]).toBeGreaterThan(180);
  await setRange(page,'range-brightness',30);await page.locator('#adjust-range').selectOption('4');await expect(page.locator('#adjust-range-brightness')).toHaveValue('0');
  await setRange(page,'range-saturation',50);await page.locator('#adjust-range').selectOption('0');await expect(page.locator('#adjust-range-brightness')).toHaveValue('30');
  await ready(page);await page.screenshot({path:testInfo.outputPath('adjust-desktop.png')});
  await page.locator('#adjust-mode').selectOption('gray');await expect(page.locator('#adjust-saturation')).toBeDisabled();await expect(page.locator('#adjust-range-saturation')).toBeDisabled();await ready(page);
  await page.locator('#adjust-reset').click();await expect(page.locator('#adjust-apply')).toBeDisabled();await expect(page.locator('#adjust-mode')).toHaveValue('color');await ready(page);expect(await previewPixel(page)).toEqual([180,80,60,255]);
  await setRange(page,'contrast',60);await page.locator('#adjust-cancel').click();expect(await snapshot(page)).toBe(before);
  await page.locator('#adjust-image').click();await expect(page.locator('#adjust-exposure')).toHaveValue('0');await expect(page.locator('#adjust-range-brightness')).toHaveValue('0');
  await page.locator('#adjust-mode').selectOption('mono');await page.keyboard.press('Escape');await expect(page.locator('#adjust-dialog')).not.toBeVisible();expect(await snapshot(page)).toBe(before);
  await page.locator('#adjust-image').click();await setRange(page,'exposure',1);
  // Close immediately while full-resolution processing is pending: no late
  // worker response may modify the image after the user cancels.
  await page.evaluate(()=>{document.getElementById('adjust-apply').click();document.getElementById('adjust-cancel').click();});
  await expect(page.locator('#adjust-dialog')).not.toBeVisible();expect(await snapshot(page)).toBe(before);
});

test('image adjustments apply at full resolution and preserve crop, rotation, recovery and exports',async({page})=>{
  const original=await insert(page,1600,400);
  await page.locator('#rotate').click();await page.locator('#flip-horizontal').click();
  await page.locator('#image-crop summary').click();await page.locator('#crop-left').fill('12');await page.locator('#apply-crop').click();
  const before=await snapshot(page),beforeGroup=JSON.parse(before)[1].children[0][1],beforeRaster=rasterRecord(before);
  await page.locator('#adjust-image').click();await page.locator('#adjust-mode').selectOption('gray');await setRange(page,'exposure',.5);await ready(page);
  expect(await page.locator('#adjust-canvas').evaluate(c=>c.width)).toBe(1200);
  const preview=await previewPixel(page);expect(preview[0]).toBe(preview[1]);expect(preview[1]).toBe(preview[2]);
  await page.locator('#adjust-apply').click();await expect(page.locator('#adjust-dialog')).not.toBeVisible();await expect(page.locator('#status')).toContainText('Image adjusted');
  const after=await snapshot(page),group=JSON.parse(after)[1].children[0][1],raster=rasterRecord(after),pixels=await rasterPixels(page,raster.source),sourcePixels=await rasterPixels(page,original);
  expect(pixels.width).toBe(1600);expect(pixels.height).toBe(400);expect(pixels.pixels[3]).toBe(0);expect(pixels.pixels[7]).toBe(sourcePixels.pixels[7]);
  expect(pixels.pixels[8]).toBe(pixels.pixels[9]);expect(pixels.pixels[9]).toBe(pixels.pixels[10]);expect(pixels.pixels[8]).toBe(preview[0]);
  expect(group.matrix).toEqual(beforeGroup.matrix);expect(group.data).toEqual(beforeGroup.data);expect(group.children[0]).toEqual(beforeGroup.children[0]);expect(raster.matrix).toEqual(beforeRaster.matrix);
  await page.locator('#undo').click();expect(await snapshot(page)).toBe(before);await page.locator('#redo').click();expect(await snapshot(page)).toBe(after);
  await page.reload();expect(await snapshot(page)).toBe(after);
  const svg=await exportSVG(page);const svgSource=await page.evaluate(svg=>{const node=new DOMParser().parseFromString(svg,'image/svg+xml').querySelector('image');return node.getAttribute('href')||node.getAttributeNS('http://www.w3.org/1999/xlink','href');},svg);
  expect(await rasterPixels(page,svgSource)).toEqual(pixels);
  page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'adjusted.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await expect(page.locator('#status')).toContainText('SVG opened');
  expect(await rasterPixels(page,rasterRecord(await snapshot(page)).source)).toEqual(pixels);await page.keyboard.press('Control+a');await expect(page.locator('#adjust-image')).toBeVisible();
  await page.locator('#file-menu-button').click();await page.locator('#export-png').click();const waiting=page.waitForEvent('download');await page.locator('#download-png').click();const bytes=Buffer.concat(await(await(await waiting).createReadStream()).toArray());
  const png=await page.evaluate(async base64=>{const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const x=c.getContext('2d');x.drawImage(image,0,0);const {data}=x.getImageData(0,0,c.width,c.height);let colored=0,visible=0;for(let i=0;i<data.length;i+=4)if(data[i+3]>200){visible++;if(data[i]!==data[i+1]||data[i+1]!==data[i+2])colored++;}return {colored,visible};},bytes.toString('base64'));
  expect(png.visible).toBeGreaterThan(10000);expect(png.colored).toBe(0);
  await page.locator('#file-menu-button').click();await page.locator('#export-editable-png').click();const editableWaiting=page.waitForEvent('download');await page.locator('#download-png').click();const editableBytes=Buffer.concat(await(await(await editableWaiting).createReadStream()).toArray());
  const editableSVG=await readEditableSVG(new Blob([editableBytes]));expect(editableSVG).toContain('<svg');
  page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'editable-adjusted.svg',mimeType:'image/svg+xml',buffer:Buffer.from(editableSVG)});await expect(page.locator('#status')).toContainText('SVG opened');
  expect(await rasterPixels(page,rasterRecord(await snapshot(page)).source)).toEqual(pixels);
});

test('rapid image adjustment previews use the final settings and keep black and white alpha',async({page})=>{
  await insert(page);await page.locator('#adjust-image').click();
  await page.locator('#adjust-exposure').evaluate(input=>{for(const value of [2,-2,1,-1,0]){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}});
  await page.locator('#adjust-mode').selectOption('mono');await setRange(page,'threshold',250);await ready(page);expect(await previewPixel(page)).toEqual([0,0,0,255]);
  await setRange(page,'threshold',10);await ready(page);expect(await previewPixel(page)).toEqual([255,255,255,255]);
  await page.locator('#adjust-apply').click();await expect(page.locator('#adjust-dialog')).not.toBeVisible();const result=await rasterPixels(page,rasterRecord(await snapshot(page)).source);
  expect(result.pixels[3]).toBe(0);expect(result.pixels[7]).toBe(128);expect(result.pixels.slice(8,12)).toEqual([255,255,255,255]);
});

test('image adjustments remain usable on a phone',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});await insert(page);await page.locator('#adjust-image').click();
  const overflow=await page.locator('#adjust-dialog').evaluate(d=>d.scrollWidth>d.clientWidth);expect(overflow).toBe(false);
  await page.screenshot({path:testInfo.outputPath('adjust-phone.png')});
  await page.locator('#adjust-range').selectOption('4');await setRange(page,'range-brightness',35);await ready(page);await page.locator('#adjust-apply').click();await expect(page.locator('#adjust-dialog')).not.toBeVisible();
});
