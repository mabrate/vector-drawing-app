import {test,expect} from '@playwright/test';
test.use({viewport:{width:1024,height:768},hasTouch:true,launchOptions:{executablePath:'/usr/bin/google-chrome'}});

async function setup(page){
 await page.goto('/');const encoded=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=240;c.height=160;const ctx=c.getContext('2d');for(const [x,y,w,h,color] of [[0,0,80,50,'#e6141e'],[0,50,80,50,'#6e0a0f'],[80,0,80,50,'#1450dc'],[80,50,80,50,'#0a1e64'],[160,0,80,100,'#ffffff']]){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}return c.toDataURL().split(',')[1];});
 await page.locator('#image-file').setInputFiles({name:'shaded-art.png',mimeType:'image/png',buffer:Buffer.from(encoded,'base64')});await expect(page.locator('#status')).toContainText('Image inserted');
 await page.locator('#trace-image').click();await page.locator('#trace-mode').selectOption('color');await page.locator('#trace-grouping').selectOption('hue');
}
async function ready(page){await expect(page.locator('#trace-result')).toHaveAttribute('aria-busy','false');await expect(page.locator('#trace-apply')).toBeEnabled();}
async function sample(page,x,y,touch=false){await page.locator('#trace-original').scrollIntoViewIfNeeded();const r=await page.locator('#trace-original').boundingBox(),p={x:r.x+x*r.width,y:r.y+y*r.height};if(touch)await page.touchscreen.tap(p.x,p.y);else await page.mouse.click(p.x,p.y);}
async function anchors(page){await page.locator('#trace-colors').fill('3');await page.locator('#trace-sample-color').click();await sample(page,.15,.15,true);await sample(page,.5,.15,true);await sample(page,.85,.15,true);await page.locator('#trace-sample-color').click();await ready(page);}

test('arbitrary color counts validate, recover from errors, and persist with grouping',async({page})=>{
 await setup(page);await page.locator('#trace-colors').fill('7');await ready(page);await expect(page.locator('#trace-colors')).toHaveValue('7');
 await page.locator('#trace-colors').fill('3.5');await expect(page.locator('#trace-status')).toContainText('whole number');await expect(page.locator('#trace-apply')).toBeDisabled();await page.locator('#trace-colors').fill('9');await ready(page);
 await page.locator('#trace-cancel').click();await page.locator('#trace-image').click();await expect(page.locator('#trace-colors')).toHaveValue('9');await expect(page.locator('#trace-grouping')).toHaveValue('hue');await ready(page);
});

test('touch-sampled anchors flatten shading, retain white and transparency, and apply with undo',async({page})=>{
 await setup(page);const saved=await page.evaluate(()=>localStorage.getItem('vector-lab'));await anchors(page);
 await expect(page.locator('#trace-anchor-count')).toHaveText('3 anchors');await expect(page.locator('#trace-white')).not.toBeChecked();expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(saved);
 const pixels=await page.locator('#trace-result svg').evaluate(async svg=>{const image=new Image();image.src='data:image/svg+xml,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));await image.decode();const c=document.createElement('canvas');c.width=240;c.height=160;const ctx=c.getContext('2d');ctx.drawImage(image,0,0,240,160);return [[35,70],[120,70],[200,40],[120,140]].map(([x,y])=>Array.from(ctx.getImageData(x,y,1,1).data));});
 expect(pixels).toEqual([[230,20,30,255],[20,80,220,255],[255,255,255,255],[0,0,0,0]]);
 await page.locator('#trace-apply').click();await expect(page.locator('#trace-dialog')).toBeHidden();const items=await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children);expect(items).toHaveLength(3);expect(items.some(i=>i[1].data?.image)).toBe(false);
 await page.locator('#canvas-undo').click();expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(saved);
});

test('anchors can be removed, reject transparency, sample while zoomed, and stay image-specific',async({page})=>{
 await setup(page);await page.locator('#trace-sample-color').click();await sample(page,.15,.15);await expect(page.locator('#trace-anchor-count')).toHaveText('1 anchor');await sample(page,.15,.15);await expect(page.locator('#trace-anchor-count')).toHaveText('1 anchor');
 await sample(page,.5,.85);await expect(page.locator('#trace-status')).toContainText('transparency');await expect(page.locator('#trace-anchor-count')).toHaveText('1 anchor');
 await page.locator('#trace-zoom-in').click();await sample(page,.5,.28);await expect(page.locator('#trace-anchors button[aria-label="Remove anchor #1450dc"]')).toBeVisible();await page.locator('#trace-anchors button[aria-label="Remove anchor #e6141e"]').click();await expect(page.locator('#trace-anchor-count')).toHaveText('1 anchor');
 await page.locator('#trace-colors').fill('1');await ready(page);await page.locator('#trace-cancel').click();await page.locator('#trace-image').click();await expect(page.locator('#trace-anchor-count')).toHaveText('0 anchors');await expect(page.locator('#trace-sample-color')).toHaveAttribute('aria-pressed','false');
 await page.locator('#trace-reset').click();await expect(page.locator('#trace-grouping')).toHaveValue('rgb');await expect(page.locator('#trace-colors')).toHaveValue('4');
});

test('anchor controls remain usable on a phone and count includes each anchor',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844});await setup(page);await page.locator('#trace-colors').fill('1');await page.locator('#trace-sample-color').click();await sample(page,.15,.15,true);await sample(page,.5,.15,true);await expect(page.locator('#trace-colors')).toHaveValue('2');await expect(page.locator('#trace-anchor-count')).toHaveText('2 anchors');await ready(page);
 await page.locator('#trace-anchors-control').scrollIntoViewIfNeeded();await page.screenshot({path:testInfo.outputPath('phone-color-anchors.png')});
 await page.locator('#trace-colors').fill('1');await expect(page.locator('#trace-status')).toContainText('include all sampled anchors');await expect(page.locator('#trace-apply')).toBeDisabled();await page.locator('#trace-clear-colors').click();await ready(page);
 expect(await page.locator('#trace-dialog').evaluate(d=>d.scrollWidth<=d.clientWidth)).toBe(true);
});
