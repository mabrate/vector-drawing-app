import {test,expect} from '@playwright/test';
// Sharing tests use the same touch-enabled portrait viewport as the iPad UI checks.
test.use({hasTouch:true,isMobile:true,viewport:{width:820,height:1180}});
const drawing='<svg xmlns="http://www.w3.org/2000/svg"><path fill="orange" d="M100 100h200v100h-200z"/><path fill="gold" d="M200 100h200v100h-200z"/></svg>';
async function load(page){page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'Duck.svg',mimeType:'image/svg+xml',buffer:Buffer.from(drawing)});await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');}
async function mockSharing(page,mode='success'){
 await page.addInitScript(mode=>{window.shareMode=mode;window.sharedFiles=[];Object.defineProperty(navigator,'canShare',{configurable:true,value:data=>window.shareMode!=='unsupported'&&data.files?.[0]?.type==='image/svg+xml'});Object.defineProperty(navigator,'share',{configurable:true,value:async data=>{if(window.shareMode==='cancel')throw new DOMException('Cancelled','AbortError');if(window.shareMode==='error')throw new DOMException('Unavailable','NotAllowedError');const file=data.files[0],activation=navigator.userActivation.isActive;window.sharedFiles.push({name:file.name,type:file.type,text:await file.text(),activation});}});},mode);
}
test.describe('iPad toolbar',()=>{
 test.use({hasTouch:true,isMobile:true,viewport:{width:820,height:1180}});
 test('portrait Properties collapses without moving the canvas when opened, and landscape restores the sidebar',async({page})=>{
  await page.goto('/');await expect(page.locator('.properties')).toBeHidden();await expect(page.locator('#mobile-properties')).toBeVisible();await expect(page.locator('#drawing-tools')).toBeVisible();
  const canvas=await page.locator('#canvas').boundingBox();expect(canvas.width).toBeGreaterThan(700);
  await page.locator('#mobile-properties').click();await expect(page.locator('.properties')).toBeVisible();expect(await page.locator('#canvas').boundingBox()).toEqual(canvas);
  for(const selector of ['#raise','#dimensions-toggle','#canvas-undo','#canvas-redo','#save','#zoom-in']){const box=await page.locator(selector).boundingBox();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);}
  await page.setViewportSize({width:1180,height:820});await expect(page.locator('.properties')).toBeVisible();await expect(page.locator('#mobile-properties')).toBeHidden();await expect(page.locator('#drawer-shade')).toBeHidden();
  await page.screenshot({path:'/tmp/vector-lab-ipad-landscape.png'});
 });
 test('scroll cues reveal grouped controls and disappear at the ends without moving artwork',async({page})=>{
  await page.goto('/');await load(page);await page.locator('#dimensions-toggle').click();
  const row=page.locator('.context'),canvas=await page.locator('#canvas').boundingBox();await row.evaluate(e=>e.scrollLeft=0);
  await expect(page.locator('#toolbar-scroll-left')).toBeHidden();await expect(page.locator('#toolbar-scroll-right')).toBeVisible();await page.locator('#toolbar-scroll-right').click();await expect.poll(()=>row.evaluate(e=>e.scrollLeft)).toBeGreaterThan(0);await expect(page.locator('#toolbar-scroll-left')).toBeVisible();
  expect(await page.locator('#canvas').boundingBox()).toEqual(canvas);
  await row.evaluate(e=>e.scrollLeft=e.scrollWidth);await expect(page.locator('#toolbar-scroll-right')).toBeHidden();await page.locator('#toolbar-scroll-left').click();
  await expect(page.locator('.toolbar-icon-group[aria-label="Combine shapes"]')).toBeVisible();expect(await page.locator('.toolbar-icon-group[aria-label="Combine shapes"]').evaluate(e=>getComputedStyle(e).borderLeftWidth)).toBe('1px');
  await page.screenshot({path:'/tmp/vector-lab-ipad-portrait.png'});
 });
 test('long press explains icons without shortcuts and does not activate them',async({page})=>{
  await page.goto('/');const button=page.locator('#dimensions-toggle');await button.dispatchEvent('pointerdown',{pointerId:1,pointerType:'touch',clientX:300,clientY:80});await expect(page.locator('#shortcut-hint')).toHaveText('Dimensions');await button.dispatchEvent('pointerup',{pointerId:1,pointerType:'touch'});await button.dispatchEvent('click');await expect(button).toHaveAttribute('aria-pressed','false');await button.click();await expect(button).toHaveAttribute('aria-pressed','true');
 });
 test('split screen retains reachable Properties and scrolling controls',async({page})=>{
  await page.setViewportSize({width:600,height:820});await page.goto('/');await load(page);await page.locator('#mobile-properties').click();await expect(page.locator('.properties')).toBeVisible();await page.locator('.properties .mobile-menu-close').click();await expect(page.locator('.properties')).toBeHidden();await expect(page.locator('#toolbar-scroll-right')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
});

test('native sharing sends the named self-contained editable SVG, matching its download',async({page})=>{
 await mockSharing(page);await page.goto('/');await load(page);await page.locator('[data-boolean=unite]').click();await page.locator('#save').click();await expect(page.locator('#svg-filename')).not.toBeFocused();await page.locator('#svg-filename').fill('My Duck.svg');await page.locator('#svg-filename').press('Enter');await expect(page.locator('#export-dialog')).toBeVisible();await expect(page.locator('#share-svg')).toBeVisible();await page.locator('#share-svg').click();await expect(page.locator('#export-dialog')).toBeHidden();
 const [shared]=await page.evaluate(()=>window.sharedFiles);expect(shared.name).toBe('My Duck.svg');expect(shared.type).toBe('image/svg+xml');expect(shared.activation).toBe(true);expect(shared.text).toContain('vector-lab-shape-building');
 await page.locator('#save').click();await expect(page.locator('#svg-filename')).toHaveValue('My Duck');const waiting=page.waitForEvent('download');await page.locator('#download-svg').click();const file=await waiting;expect(file.suggestedFilename()).toBe(shared.name);expect(Buffer.concat(await (await file.createReadStream()).toArray()).toString()).toBe(shared.text);
});
for(const mode of ['cancel','error'])test(`native sharing ${mode} preserves the prepared download and drawing`,async({page})=>{
 await mockSharing(page,mode);await page.goto('/');await load(page);const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));await page.locator('#save').click();await page.locator('#share-svg').click();await expect(page.locator('#export-dialog')).toBeVisible();await expect(page.locator('#export-status')).toContainText(mode==='cancel'?'Sharing cancelled':'Sharing could not start');await expect(page.locator('#download-svg')).toBeEnabled();await expect(page.locator('#svg-filename')).toBeEnabled();expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
 await page.evaluate(()=>window.shareMode='success');await page.locator('#share-svg').click();await expect(page.locator('#export-dialog')).toBeHidden();
});
test('unsupported SVG sharing falls back to a safely named download',async({page})=>{
 await mockSharing(page,'unsupported');await page.goto('/');await load(page);await page.locator('#save').click();await expect(page.locator('#share-svg')).toBeHidden();await expect(page.locator('#share-help')).toContainText('Share in Files');await page.locator('#svg-filename').fill('Duck / orange.svg');const waiting=page.waitForEvent('download');await page.locator('#download-svg').click();const file=await waiting;expect(file.suggestedFilename()).toBe('Duck - orange.svg');expect(Buffer.concat(await (await file.createReadStream()).toArray()).toString()).toContain('<path');
});
