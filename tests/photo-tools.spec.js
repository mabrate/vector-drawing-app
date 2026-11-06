import {test,expect} from '@playwright/test';
import {defaultCorners,levelingAngle,rotationFrame,correctPerspective,validCorners} from '../src/image-straightening.js';
import {rotateSelection,useCropTool} from './helpers/canvas-transforms.js';
import {pathAction} from './helpers/path-actions.js';

test.use({launchOptions:{executablePath:'/usr/bin/google-chrome',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']}});
const saved=page=>page.evaluate(()=>localStorage.getItem('vector-lab'));
async function paperState(page){return page.evaluate(async()=>{
  const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),item=paper.project.layers[1].firstChild,raster=item?.getItems({class:paper.Raster})[0];
  return {count:paper.project.layers[1].children.length,bounds:item?.bounds.toJSON(),matrix:item?.matrix.values,source:raster?.toDataURL(),size:raster?[raster.width,raster.height]:null,data:item?.data};
});}
async function imageFile(page,width=240,height=140){
  const source=await page.evaluate(({width,height})=>{
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
    ctx.fillStyle='white';ctx.fillRect(0,0,width,height);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){ctx.fillStyle=`rgb(${Math.round(x/width*255)},${Math.round(y/height*255)},80)`;ctx.fillRect(x,y,1,1);}
    return canvas.toDataURL().split(',')[1];
  },{width,height});return {name:'photo.png',mimeType:'image/png',buffer:Buffer.from(source,'base64')};
}
async function insert(page){await page.goto('/');await page.locator('#image-file').setInputFiles(await imageFile(page));await expect(page.locator('#status')).toContainText('Image inserted');}
async function straighten(page){await useCropTool(page);await page.locator('#straighten-image').click();await expect(page.locator('#straighten-dialog')).toBeVisible();}
async function exportSVG(page){await page.locator('#save').click();await expect(page.locator('#download-svg')).toBeEnabled();const next=page.waitForEvent('download');await page.locator('#download-svg').click();return Buffer.concat(await(await(await next).createReadStream()).toArray()).toString();}
async function reopen(page,svg){page.once('dialog',dialog=>dialog.accept());await page.locator('#file').setInputFiles({name:'straightened.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');}
async function dragCorner(page,index,x,y){
  const canvas=await page.locator('#straighten-canvas').boundingBox(),handle=await page.locator(`[data-corner="${index}"]`).boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();await page.mouse.move(canvas.x+x*canvas.width,canvas.y+y*canvas.height,{steps:5});await page.mouse.up();
}
async function camera(page){await page.locator('#image-import-size-toggle').click();await page.locator('#insert-camera').click();}
async function cutHole(page){
  const points=await page.evaluate(async()=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),r=document.querySelector('#canvas').getBoundingClientRect();return [[513,393],[543,423]].map(xy=>{const p=paper.view.projectToView(new paper.Point(xy));return {x:p.x+r.x,y:p.y+r.y};});});
  await page.locator('[data-tool=ellipse]').click();await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points[1].x,points[1].y,{steps:5});await page.mouse.up();await page.locator('[data-tool=select]').click();await page.keyboard.press('Control+a');await pathAction(page,'[data-boolean=subtract]');await expect(page.locator('#status')).toContainText('Shape subtracted');
}

test('straightening geometry levels reversed lines and trims inside the rotated frame',()=>{
  expect(levelingAngle({x:0,y:0},{x:100,y:10})).toBeCloseTo(-5.71059,4);
  expect(levelingAngle({x:100,y:10},{x:0,y:0})).toBeCloseTo(-5.71059,4);
  expect(levelingAngle({x:0,y:0},{x:10,y:100},true)).toBeCloseTo(5.71059,4);
  const result=rotationFrame(240,140,13,true),angle=13*Math.PI/180;
  for(const x of [-result.width/2,result.width/2])for(const y of [-result.height/2,result.height/2]){
    expect(Math.abs(x*Math.cos(angle)+y*Math.sin(angle))).toBeLessThanOrEqual(120.00001);
    expect(Math.abs(-x*Math.sin(angle)+y*Math.cos(angle))).toBeLessThanOrEqual(70.00001);
  }
});

test('perspective mapping preserves identity, alpha and a known trapezoid',()=>{
  const width=100,height=80,data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(y*width+x)*4;data[i]=x*2;data[i+1]=y*3;data[i+2]=80;data[i+3]=x<10?0:255;}
  const original=data.slice();const identity=correctPerspective({width,height,data},defaultCorners());
  // Transparent RGB is normalized; opaque pixels retain their exact values.
  expect(Array.from(identity.data.slice(40,400))).toEqual(Array.from(data.slice(40,400)));
  expect(identity.data[3]).toBe(0);expect(data).toEqual(original);
  const points=[{x:.2,y:.1},{x:.8,y:.1},{x:.95,y:.9},{x:.05,y:.9}];
  const result=correctPerspective({width,height,data},points);
  const sample=(u,v)=>Array.from(result.data.slice((Math.floor(v*result.height)*result.width+Math.floor(u*result.width))*4,(Math.floor(v*result.height)*result.width+Math.floor(u*result.width))*4+4));
  // Independent expected center: intersection of the trapezoid's diagonals.
  expect(sample(.5,.5)[0]).toBeCloseTo(100,-1);expect(sample(.5,.5)[1]).toBeGreaterThan(90);expect(sample(.5,.5)[1]).toBeLessThan(105);
  expect(validCorners([points[0],points[2],points[1],points[3]])).toBe(false);
  expect(()=>correctPerspective({width,height,data},[points[0],points[2],points[1],points[3]])).toThrow();
});

test('level preview, line guide, reset and cancel leave pixels and artwork untouched',async({page},testInfo)=>{
  await insert(page);const before=await saved(page);await expect(page.locator('#straighten-image')).toBeHidden();await straighten(page);
  await expect(page.locator('#straighten-apply')).toBeDisabled();await page.locator('#straighten-angle-number').fill('12.3');await expect(page.locator('#straighten-angle')).toHaveValue('12.3');
  await page.locator('#straighten-trim').check();expect(await saved(page)).toBe(before);
  await page.locator('#straighten-original').check();await expect(page.locator('#straighten-status')).toContainText('Showing original');await page.locator('#straighten-original').uncheck();
  await page.locator('#straighten-reset').click();await expect(page.locator('#straighten-apply')).toBeDisabled();
  const controls=await page.evaluate(()=>({number:document.querySelector('#straighten-angle-number').getBoundingClientRect().toJSON(),range:document.querySelector('#straighten-angle').getBoundingClientRect().toJSON()}));expect(controls.number.width).toBeLessThanOrEqual(100);expect(controls.number.height).toBeGreaterThanOrEqual(44);expect(controls.range.width).toBeGreaterThan(100);
  const rect=await page.locator('#straighten-canvas').boundingBox();await page.mouse.move(rect.x+rect.width*.2,rect.y+rect.height*.4);await page.mouse.down();await page.mouse.move(rect.x+rect.width*.8,rect.y+rect.height*.5,{steps:5});await page.mouse.up();
  await expect.poll(async()=>Number(await page.locator('#straighten-angle-number').inputValue())).toBeLessThan(-4);
  await page.screenshot({path:testInfo.outputPath('straighten-desktop.png')});await page.keyboard.press('Escape');expect(await saved(page)).toBe(before);
});

test('level and trim preserve embedded pixels, rotation, crops, undo, recovery and SVG',async({page})=>{
  await insert(page);await rotateSelection(page,30);await page.locator('#flip-horizontal').click();
  await useCropTool(page);await page.locator('#image-crop summary').click();await page.locator('#crop-left').fill('12');await page.locator('#apply-crop').click();
  const before=await saved(page),original=await paperState(page);
  await straighten(page);await page.locator('#straighten-angle-number').fill('-8');await page.locator('#straighten-trim').check();await page.locator('#straighten-apply').click();
  await expect(page.locator('#status')).toContainText('Image straightened');const after=await saved(page),state=await paperState(page);expect(state.source).toBe(original.source);expect(state.data.intersections).toHaveLength(1);expect(after).not.toBe(before);
  await page.locator('#canvas-undo').click();expect(await saved(page)).toBe(before);await page.locator('#canvas-redo').click();expect(await saved(page)).toBe(after);await page.reload();expect(await saved(page)).toBe(after);
  const svg=await exportSVG(page);await reopen(page,svg);const reopened=await paperState(page);expect(reopened.source).toBe(original.source);expect(reopened.data.intersections).toHaveLength(1);
  await straighten(page);await page.locator('#straighten-angle-number').fill('4');await page.locator('#straighten-apply').click();await expect(page.locator('#status')).toContainText('Image straightened');
});

test('perspective corners correct a photo, reject crossed corners and restore the original after SVG reopen',async({page},testInfo)=>{
  await insert(page);await rotateSelection(page);await useCropTool(page);await page.locator('#image-crop summary').click();await page.locator('#crop-right').fill('10');await page.locator('#apply-crop').click();
  const before=await saved(page),original=await paperState(page);await straighten(page);await page.locator('#straighten-mode').selectOption('perspective');
  await dragCorner(page,0,.13,.1);await dragCorner(page,1,.9,.04);await dragCorner(page,2,.93,.92);await dragCorner(page,3,.05,.85);
  await dragCorner(page,0,.97,.97);await expect(page.locator('#straighten-apply')).toBeDisabled();await expect(page.locator('#straighten-status')).toContainText('clockwise');await dragCorner(page,0,.13,.1);
  expect(await saved(page)).toBe(before);await expect(page.locator('#straighten-apply')).toBeEnabled();await page.screenshot({path:testInfo.outputPath('perspective-desktop.png')});
  await page.locator('#straighten-apply').click();await expect(page.locator('#status')).toContainText('Perspective corrected');const after=await saved(page),state=await paperState(page);expect(state.source).not.toBe(original.source);expect(state.data.perspectiveOriginal.source).toBe(original.source);
  await page.locator('#canvas-undo').click();expect(await saved(page)).toBe(before);await page.locator('#canvas-redo').click();expect(await saved(page)).toBe(after);await page.reload();expect(await saved(page)).toBe(after);
  await reopen(page,await exportSVG(page));await straighten(page);await page.locator('#straighten-restore').click();await expect(page.locator('#status')).toContainText('Original image restored');const restored=await paperState(page);expect(restored.source).toBe(original.source);expect(restored.size).toEqual(original.size);expect(restored.data.crop).toEqual(original.data.crop);
  for(let i=0;i<6;i++)expect(restored.matrix[i]).toBeCloseTo(original.matrix[i],6);
  await page.locator('#canvas-undo').click();expect((await paperState(page)).data.perspectiveOriginal).toBeTruthy();
});

test('perspective preview supports touch and keyboard corners on a phone without overflowing',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});await insert(page);await straighten(page);await page.locator('#straighten-mode').selectOption('perspective');
  const before=await saved(page),corner=page.locator('[data-corner="0"]');await expect(corner).toBeVisible();await corner.focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown');
  await expect(page.locator('#straighten-apply')).toBeEnabled();
  const point=await page.locator('#straighten-canvas').boundingBox(),handle=await corner.boundingBox(),cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:handle.x+handle.width/2,y:handle.y+handle.height/2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+30,y:point.y+20}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect.poll(()=>corner.evaluate(button=>parseFloat(button.style.left))).toBeGreaterThan(8);
  expect(await page.locator('#straighten-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await saved(page)).toBe(before);
  await page.screenshot({path:testInfo.outputPath('straighten-phone.png')});await page.locator('#straighten-cancel').click();expect(await saved(page)).toBe(before);
});

test('trimmed leveling renders the expected rotated pixels and preserves a shape cutout',async({page})=>{
  await insert(page);await cutHole(page);await rotateSelection(page,30);
  const originalSVG=await exportSVG(page),bounds=await page.evaluate(async()=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),b=paper.project.layers[1].firstChild.bounds;return {x:b.x,y:b.y,width:b.width,height:b.height};});
  await straighten(page);await page.locator('#straighten-angle-number').fill('-13');await page.locator('#straighten-trim').check();await page.locator('#straighten-apply').click();const actualSVG=await exportSVG(page),size=rotationFrame(bounds.width,bounds.height,-13,true);
  const difference=await page.evaluate(async({originalSVG,actualSVG,bounds,size})=>{
    const load=async svg=>{const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();return image;};
    const original=await load(originalSVG),actual=await load(actualSVG),cx=bounds.x+bounds.width/2,cy=bounds.y+bounds.height/2;
    const canvas=document.createElement('canvas');canvas.width=1056;canvas.height=816;const ctx=canvas.getContext('2d');
    ctx.save();ctx.beginPath();ctx.rect(cx-size.width/2,cy-size.height/2,size.width,size.height);ctx.clip();ctx.translate(cx,cy);ctx.rotate(-13*Math.PI/180);ctx.drawImage(original,-cx,-cy);ctx.restore();const expected=ctx.getImageData(0,0,1056,816).data;
    ctx.clearRect(0,0,1056,816);ctx.drawImage(actual,0,0);const pixels=ctx.getImageData(0,0,1056,816).data;
    let bad=0,samples=0;for(let y=280;y<540;y+=2)for(let x=350;x<700;x+=2){const i=(y*1056+x)*4;if(expected[i+3]>0&&expected[i+3]<255)continue;samples++;if(Math.abs(pixels[i+3]-expected[i+3])>25||expected[i+3]===255&&[0,1,2].some(j=>Math.abs(pixels[i+j]-expected[i+j])>15))bad++;}
    return {bad,samples,hole:pixels[(408*1056+528)*4+3]};
  },{originalSVG,actualSVG,bounds,size});
  expect(difference.samples).toBeGreaterThan(10000);expect(difference.bad).toBeLessThan(25);expect(difference.hole).toBe(0);
});

test('perspective worker preserves mask transparency and editable PNG carries the restorable source',async({page})=>{
  await insert(page);await cutHole(page);const before=await saved(page),original=await paperState(page);await straighten(page);await page.locator('#straighten-mode').selectOption('perspective');
  for(const [i,x,y] of [[0,.1,.1],[1,.9,.1],[2,.9,.9],[3,.1,.9]])await dragCorner(page,i,x,y);
  await page.locator('#straighten-apply').click();await expect(page.locator('#status')).toContainText('Perspective corrected');
  const pixels=await page.evaluate(async()=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),raster=paper.project.layers[1].firstChild.getItems({class:paper.Raster})[0],ctx=raster.canvas.getContext('2d'),w=raster.width,h=raster.height;return {width:w,height:h,corner:Array.from(ctx.getImageData(10,10,1,1).data),center:Array.from(ctx.getImageData(Math.floor(w/2),Math.floor(h/2),1,1).data)};});
  expect(pixels.width).toBeCloseTo(192,0);expect(pixels.height).toBeCloseTo(112,0);expect(pixels.center[3]).toBe(0);expect(pixels.corner[0]).toBeGreaterThan(30);expect(pixels.corner[0]).toBeLessThan(45);expect(pixels.corner[3]).toBe(255);
  await page.locator('#file-menu-button').click();await page.locator('#export-editable-png').click();const downloading=page.waitForEvent('download');await page.locator('#download-png').click();const bytes=Buffer.concat(await(await(await downloading).createReadStream()).toArray());
  await page.locator('#image-file').setInputFiles({name:'corrected.png',mimeType:'image/png',buffer:bytes});await page.locator('#png-import-dialog [value=editable]').click();await expect(page.locator('#status')).toContainText('Image inserted');
  await straighten(page);await expect(page.locator('#straighten-restore')).toBeVisible();await page.locator('#straighten-restore').click();await expect(page.locator('#status')).toContainText('Original image restored');
  const companion=await page.evaluate(async()=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),item=paper.project.layers[1].lastChild;return {source:item.getItems({class:paper.Raster})[0].toDataURL(),data:item.data};});expect(companion.source).toBe(original.source);expect(companion.data.cutouts).toEqual(original.data.cutouts);expect(companion.data.perspectiveOriginal).toBeUndefined();
  expect(await saved(page)).not.toBe(before);
});

test('canceling a pending perspective worker never changes the drawing',async({page})=>{
  await insert(page);const before=await saved(page);await straighten(page);await page.locator('#straighten-mode').selectOption('perspective');await dragCorner(page,0,.1,.1);
  await page.evaluate(()=>{document.getElementById('straighten-apply').click();document.getElementById('straighten-cancel').click();});await expect(page.locator('#straighten-dialog')).toBeHidden();
  await expect(page.locator('#straighten-dialog')).not.toHaveAttribute('aria-busy','true');expect(await saved(page)).toBe(before);
  await straighten(page);await expect(page.locator('#straighten-apply')).toBeDisabled();expect(await saved(page)).toBe(before);
});

test('camera captures, retakes and embeds a photo with undo and SVG recovery, releasing every stream',async({page},testInfo)=>{
  await page.addInitScript(()=>{window.cameraStreams=[];const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await original(constraints);window.cameraStreams.push(stream);return stream;};});
  await page.goto('/');const before=await saved(page);await camera(page);await expect(page.locator('#camera-take')).toBeEnabled();expect(await saved(page)).toBe(before);
  await page.screenshot({path:testInfo.outputPath('camera-live.png')});
  await page.locator('#camera-take').click();await expect(page.locator('#camera-photo')).toBeVisible();expect(await saved(page)).toBe(before);expect(await page.evaluate(()=>window.cameraStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
  await page.screenshot({path:testInfo.outputPath('camera-captured.png')});
  await page.locator('#camera-retake').click();await expect(page.locator('#camera-take')).toBeEnabled();await page.locator('#camera-take').click();await page.locator('#camera-use').click();await expect(page.locator('#status')).toContainText('Image inserted');
  const state=await paperState(page);expect(state.size[0]).toBeGreaterThan(0);expect(state.count).toBe(1);expect(await page.evaluate(()=>window.cameraStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);
  const after=await saved(page);await page.locator('#canvas-undo').click();expect(await saved(page)).toBe(before);await page.locator('#canvas-redo').click();await page.reload();expect(await saved(page)).toBe(after);await reopen(page,await exportSVG(page));expect((await paperState(page)).source).toBe(state.source);
});

test('camera cancellation and permission errors preserve the drawing, including late camera access',async({page})=>{
  await insert(page);const before=await saved(page);
  await page.evaluate(()=>{window.cameraStreams=[];const original=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await original(constraints);window.cameraStreams.push(stream);await new Promise(resolve=>window.releaseCamera=resolve);return stream;};});
  await camera(page);await expect.poll(()=>page.evaluate(()=>typeof window.releaseCamera)).toBe('function');await page.keyboard.press('Escape');await page.evaluate(()=>window.releaseCamera());
  await expect.poll(()=>page.evaluate(()=>window.cameraStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')))).toBe(true);expect(await saved(page)).toBe(before);
  await page.evaluate(()=>navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Denied','NotAllowedError');});await camera(page);await expect(page.locator('#camera-status')).toContainText('permission was denied');await expect(page.locator('#camera-file-button')).toBeEnabled();await page.locator('#camera-cancel').click();expect(await saved(page)).toBe(before);
});

test('mobile Take photo uses rear camera capture and normalizes a portrait photo before import',async({browser})=>{
  const context=await browser.newContext({userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',viewport:{width:820,height:1180}}),page=await context.newPage();
  await page.goto('http://127.0.0.1:5187/');const file=await imageFile(page,120,240);
  const jpeg=Buffer.from(await page.evaluate(async base64=>{const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;canvas.getContext('2d').drawImage(image,0,0);return canvas.toDataURL('image/jpeg').split(',')[1];},file.buffer.toString('base64')),'base64');
  file.name='portrait.jpg';file.mimeType='image/jpeg';file.buffer=Buffer.concat([jpeg.subarray(0,2),Buffer.from('ffe100224578696600004d4d002a00000008000101120003000000010006000000000000','hex'),jpeg.subarray(2)]);
  await expect(page.locator('#camera-file')).toHaveAttribute('capture','environment');const chooser=page.waitForEvent('filechooser');await camera(page);await(await chooser).setFiles(file);
  await expect(page.locator('#status')).toContainText('Image inserted');expect((await paperState(page)).size).toEqual([240,120]);expect((await paperState(page)).source).toMatch(/^data:image\/jpeg/);await expect(page.locator('#camera-dialog')).toBeHidden();
  const before=await saved(page);await page.locator('#camera-file').setInputFiles({name:'broken.heic',mimeType:'image/heic',buffer:Buffer.from('broken image')});await expect(page.locator('#status')).toContainText('Could not read this camera photo');expect(await saved(page)).toBe(before);await context.close();
});
