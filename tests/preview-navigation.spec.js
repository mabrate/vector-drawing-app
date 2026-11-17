import {test,expect} from '@playwright/test';
test.use({viewport:{width:1100,height:900},hasTouch:true,launchOptions:{executablePath:'/usr/bin/google-chrome'}});
test.setTimeout(90000);
const saved=page=>page.evaluate(()=>localStorage.getItem('vector-lab'));
async function image(page){
  await page.goto('/');const encoded=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=240;c.height=160;c.getContext('2d').fillRect(0,0,240,160);return c.toDataURL().split(',')[1];});
  await page.locator('#image-file').setInputFiles({name:'navigation.png',mimeType:'image/png',buffer:Buffer.from(encoded,'base64')});await expect(page.locator('#status')).toContainText('Image inserted');
}
async function drag(page,viewport,dx,dy,button='left'){
  await viewport.scrollIntoViewIfNeeded();const box=await viewport.boundingBox(),x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);await page.mouse.down({button});await page.mouse.move(x+dx,y+dy,{steps:3});await page.mouse.up({button});
}
const pixels=canvas=>canvas.evaluate(c=>c.toDataURL());
async function ready(page){await expect(page.locator('#trace-result')).toHaveAttribute('aria-busy','false');await expect(page.locator('#trace-apply')).toBeEnabled();}
async function touchPan(page,viewport,{pinch=false}={}){
  await viewport.scrollIntoViewIfNeeded();const r=await viewport.boundingBox(),x=r.x+r.width/2,y=r.y+r.height/2,cdp=await page.context().newCDPSession(page);
  const point=(id,x,y)=>({id,x,y,radiusX:2,radiusY:2});
  // The first finger would paint/sample; the second must safely turn this into
  // navigation and discard only that provisional edit.
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,x-20,y)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(1,x-20,y),point(2,x+20,y)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(1,x-(pinch?25:20)+10,y+10),point(2,x+(pinch?25:20)+10,y+10)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
}

test('background pan tool, Space, middle drag and wheel navigate without changing the removal mask',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await image(page);const before=await saved(page);await page.locator('#remove-background').click();await page.locator('#background-mode').selectOption('paint');
  const canvas=page.locator('#background-canvas'),viewport=page.locator('.background-workspace'),original=await pixels(canvas);
  for(let i=0;i<4;i++)await page.locator('#background-zoom-in').click();const zoom=await page.locator('#background-zoom-value').textContent();
  await page.locator('#background-pan').click();let prior=await canvas.boundingBox();await drag(page,viewport,40,20);let after=await canvas.boundingBox();expect(after.x-prior.x).toBeCloseTo(40,0);expect(after.y-prior.y).toBeCloseTo(20,0);
  await page.locator('#background-pan').click();await canvas.focus();await page.keyboard.down('Space');prior=await canvas.boundingBox();await drag(page,viewport,-20,10);await page.keyboard.up('Space');expect((await canvas.boundingBox()).x-prior.x).toBeCloseTo(-20,0);
  prior=await canvas.boundingBox();await drag(page,viewport,25,-15,'middle');expect((await canvas.boundingBox()).x-prior.x).toBeCloseTo(25,0);
  await viewport.hover();prior=await canvas.boundingBox();await page.mouse.wheel(20,30);await expect.poll(async()=>Math.round((await canvas.boundingBox()).x-prior.x)).toBe(-20);await expect(page.locator('#background-zoom-value')).toHaveText(zoom);
  expect(await pixels(canvas)).toBe(original);await expect(page.locator('#background-undo')).toBeDisabled();await expect(page.locator('#background-feedback')).toHaveText('0.0% selected for removal');
  await page.keyboard.down('Control');await page.mouse.wheel(0,-100);await page.keyboard.up('Control');await expect(page.locator('#background-zoom-value')).not.toHaveText(zoom);
  await drag(page,viewport,5,5);await expect(page.locator('#background-undo')).toBeEnabled();await page.locator('#background-undo').click();expect(await pixels(canvas)).toBe(original);
  await touchPan(page,viewport,{pinch:true});expect(await pixels(canvas)).toBe(original);await expect(page.locator('#background-undo')).toBeDisabled();
  await page.locator('#background-pan').click();await viewport.evaluate(v=>{
    const r=v.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    for(const [type,clientX,clientY] of [['pointerdown',x,y],['pointermove',x+10,y+10]])v.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:90,pointerType:'touch',button:0,buttons:1,clientX,clientY}));
  });prior=await canvas.boundingBox();await viewport.dispatchEvent('pointerup',{pointerId:90,pointerType:'touch',clientX:0,clientY:0});expect((await canvas.boundingBox()).x).toBeCloseTo(prior.x,0);expect((await canvas.boundingBox()).y).toBeCloseTo(prior.y,0);
  await page.locator('#background-fit').click();await expect(page.locator('#background-zoom-value')).toHaveText('100%');const a=await canvas.boundingBox(),v=await viewport.boundingBox();expect(a.x+a.width/2).toBeCloseTo(v.x+v.width/2,0);
  await page.setViewportSize({width:390,height:844});await expect(page.locator('#background-pan')).toBeVisible();expect(await page.locator('#background-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);await page.screenshot({path:testInfo.outputPath('background-mobile.png')});
  await page.locator('#background-cancel').click();expect(await saved(page)).toBe(before);await page.locator('#remove-background').click();await expect(page.locator('#background-pan')).toHaveAttribute('aria-pressed','false');expect(errors).toEqual([]);
});

test('trace pans both previews while a brush is selected and keeps paint coordinates correct',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await image(page);const before=await saved(page);await page.locator('#trace-image').click();await ready(page);
  await page.locator('#trace-zoom-in').click();await page.locator('#trace-zoom-in').click();await page.locator('#trace-brush-mode').selectOption('exclude');
  const canvas=page.locator('#trace-original'),viewport=canvas.locator('..'),result=page.locator('#trace-result svg'),original=await pixels(canvas);
  await page.locator('#trace-pan').click();let a=await canvas.boundingBox(),b=await result.boundingBox();await drag(page,page.locator('#trace-result'),30,-15);
  expect((await canvas.boundingBox()).x-a.x).toBeCloseTo(30,0);expect((await result.boundingBox()).x-b.x).toBeCloseTo(30,0);expect(await pixels(canvas)).toBe(original);await expect(page.locator('#trace-edit-undo')).toBeDisabled();
  await page.locator('#trace-pan').click();await canvas.focus();await page.keyboard.down('Space');a=await canvas.boundingBox();await drag(page,viewport,-20,10);await page.keyboard.up('Space');expect((await canvas.boundingBox()).x-a.x).toBeCloseTo(-20,0);
  await drag(page,page.locator('#trace-result'),15,-5,'middle');expect(await pixels(canvas)).toBe(original);await expect(page.locator('#trace-brush-mode')).toHaveValue('exclude');
  await viewport.hover();const zoom=await page.locator('#trace-zoom-value').textContent();await page.mouse.wheel(15,20);await expect(page.locator('#trace-zoom-value')).toHaveText(zoom);
  await viewport.scrollIntoViewIfNeeded();const r=await viewport.boundingBox(),c=await canvas.boundingBox(),size=await canvas.evaluate(c=>({w:c.width,h:c.height})),point={x:r.x+r.width/2,y:r.y+r.height/2},pixel={x:Math.floor((point.x-c.x)*size.w/c.width),y:Math.floor((point.y-c.y)*size.h/c.height)};
  await page.mouse.click(point.x,point.y);await ready(page);await expect(page.locator('#trace-status')).toContainText('Manual corrections applied');expect(await canvas.evaluate((c,p)=>c.getContext('2d').getImageData(p.x,p.y,1,1).data[0],pixel)).toBeGreaterThan(100);
  await page.locator('#trace-edit-undo').click();await ready(page);expect(await pixels(canvas)).toBe(original);
  await page.setViewportSize({width:390,height:844});await touchPan(page,viewport,{pinch:true});expect(await pixels(canvas)).toBe(original);await expect(page.locator('#trace-edit-undo')).toBeDisabled();await expect(page.locator('#trace-brush-mode')).toHaveValue('exclude');
  await page.locator('#trace-zoom-fit').click();await expect(page.locator('#trace-zoom-value')).toHaveText('100%');expect(await page.locator('#trace-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);await page.locator('#trace-pan').scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('trace-mobile.png')});
  await page.locator('#trace-cancel').click();expect(await saved(page)).toBe(before);expect(errors).toEqual([]);
});

test('two-finger navigation never adds color anchors or removes spots',async({page})=>{
  await image(page);await page.locator('#trace-image').click();await page.locator('#trace-mode').selectOption('color');await page.locator('#trace-white').uncheck();await ready(page);await page.locator('#trace-zoom-in').click();
  const canvas=page.locator('#trace-original'),viewport=canvas.locator('..');await page.locator('#trace-sample-color').click();await touchPan(page,viewport);await expect(page.locator('#trace-anchor-count')).toHaveText('0 anchors');
  // Some touch releases report stale coordinates. A tap samples its initial
  // position; only actual pointer movement turns it into a cancelled tap.
  await canvas.evaluate(c=>c.addEventListener('pointerdown',e=>window.samplePointer=e.pointerId,{once:true}));
  const r=await viewport.boundingBox(),cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:r.x+r.width/2,y:r.y+r.height/2}]});
  await canvas.evaluate(c=>c.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch',pointerId:window.samplePointer,clientX:0,clientY:0})));
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();await expect(page.locator('#trace-anchor-count')).toHaveText('1 anchor');await ready(page);
  await page.locator('#trace-brush-mode').selectOption('spot');const original=await pixels(canvas),paths=await page.locator('#trace-result svg').innerHTML();await touchPan(page,viewport);expect(await pixels(canvas)).toBe(original);expect(await page.locator('#trace-result svg').innerHTML()).toBe(paths);await expect(page.locator('#trace-edit-undo')).toBeDisabled();
});
