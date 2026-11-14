import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {rectangle,circle,stored,snapshot,idle,load,open,choose,pathButton,preview,applyTool,addBox,editLast,center} from './model3d-helpers.js';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome',args:['--enable-unsafe-swiftshader']},hasTouch:true});
test.setTimeout(120000);

test('choose a tool, select paths in 3D, preview and apply without changing the drawing until Save',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await open(page);const before=await snapshot(page);
  await expect(page.locator('#model3d-features li')).toHaveCount(0);await expect(page.locator('#model3d-tool-panel')).toBeHidden();
  await choose(page,'extrude');await expect(page.locator('#model3d-preview')).toBeDisabled();await expect(page.locator('#model3d-shell')).toBeHidden();await expect(page.locator('#model3d-edges')).toBeHidden();
  await page.locator('[data-model-view=top]').click();const p=await center(page);await page.mouse.click(p.x,p.y);await expect(pathButton(page)).toHaveAttribute('aria-pressed','true');
  await page.touchscreen.tap(p.x,p.y);await expect(pathButton(page)).toHaveAttribute('aria-pressed','false');await page.touchscreen.tap(p.x,p.y);
  await page.locator('#model3d-height').fill('12');await preview(page);await expect(page.locator('#model3d-view-state')).toHaveText('Result preview');await expect(page.locator('#model3d-pick-mode')).toBeDisabled();
  await expect(page.locator('#model3d-features li')).toHaveCount(0);expect(await snapshot(page)).toBe(before);
  await page.locator('#model3d-apply-tool').click();await expect(page.locator('#model3d-features li')).toHaveCount(1);expect(await snapshot(page)).toBe(before);
  await page.locator('#model3d-cancel').click();expect(await snapshot(page)).toBe(before);
  await page.keyboard.press('Control+a');await page.locator('#extrude-path').click();await idle(page);await expect(pathButton(page)).toHaveAttribute('aria-pressed','true');await applyTool(page);await page.locator('#model3d-apply').click();
  expect((await stored(page)).features[0].height).toBe(10);await page.locator('#canvas-undo').click();expect((await stored(page))?.features||[]).toHaveLength(0);await page.locator('#canvas-redo').click();expect((await stored(page)).features).toHaveLength(1);expect(errors).toEqual([]);
});

test('feature edits have Preview, Apply and Cancel boundaries and survive SVG and recovery',async({page})=>{
  await open(page);await addBox(page);await page.locator('#model3d-apply').click();const original=await stored(page);
  await page.locator('#model3d-open').click();await idle(page);await editLast(page);await page.locator('#model3d-height').fill('12');await preview(page);await page.locator('#model3d-cancel-tool').click();await idle(page);await page.locator('#model3d-apply').click();expect(await stored(page)).toEqual(original);
  await page.locator('#model3d-open').click();await idle(page);await editLast(page);await page.locator('#model3d-height').fill('12');await applyTool(page);await page.locator('#model3d-apply').click();expect((await stored(page)).features[0].height).toBe(12);
  await page.reload();await page.locator('#model3d-open').click();await idle(page);await expect(page.locator('#model3d-tool-panel')).toBeHidden();await editLast(page);await expect(page.locator('#model3d-height')).toHaveValue('12');await page.locator('#model3d-cancel-tool').click();await idle(page);
  for(const format of ['stl','step']){const event=page.waitForEvent('download');await page.locator(`#model3d-${format}`).click();expect((await event).suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));await idle(page);}
  await page.locator('#model3d-cancel').click();await page.locator('#save').click();const event=page.waitForEvent('download');await page.locator('#download-svg').click();const file=await(await event).path();page.once('dialog',dialog=>dialog.accept());await page.locator('#file').setInputFiles(file);await expect(page.locator('#status')).toContainText('SVG opened');expect((await stored(page)).features[0].height).toBe(12);
});

test('circular draft previews recover after invalid dimensions and preserve units and the original profile',async({page})=>{
  await open(page,circle);await choose(page,'extrude');await pathButton(page).click();await page.locator('#model3d-draft').fill('5');await preview(page);await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 2874.754 mm³');
  await page.locator('#model3d-height').fill('200');await expect(page.locator('#model3d-status')).toContainText('draft closes the circular profile',{timeout:90000});await expect(page.locator('#model3d-apply-tool')).toBeDisabled();
  await page.locator('#model3d-height').fill('10');await expect(page.locator('#model3d-apply-tool')).toBeEnabled({timeout:90000});await page.locator('#model3d-unit').selectOption('in');expect(Number(await page.locator('#model3d-height').inputValue())).toBeCloseTo(10/25.4,6);
  await page.locator('#model3d-apply-tool').click();await page.locator('#model3d-apply').click();const recipe=await stored(page);expect(recipe.features[0].height).toBe(10);expect(recipe.features[0].draft).toBe(5);
  await page.reload();await page.locator('#model3d-open').click();await idle(page);await expect(page.locator('#model3d-summary')).toContainText('2874.754');expect(await stored(page)).toEqual(recipe);
});

test('Join and Cut select paths and bodies inside the workspace and an edit can replace a copied profile',async({page})=>{
  const svg=rectangle.replace('</svg>','<path id="Boss" d="M0 0H80V60H0Z" fill="blue"/></svg>');await open(page,svg);
  await choose(page,'extrude');await pathButton(page,0).click();await page.locator('#model3d-height').fill('3');await applyTool(page);
  await choose(page,'join');await pathButton(page,0).click();await pathButton(page,1).click();await page.locator('#model3d-height').fill('15');await applyTool(page);await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 8064.5 mm³');
  await choose(page,'cut');await page.locator('#model3d-height').fill('2');await page.locator('#model3d-start').fill('13');await applyTool(page);await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 7392.458 mm³');
  await page.locator('#model3d-apply').click();expect((await stored(page)).features.map(feature=>feature.operation)).toEqual(['new','join','cut']);
  await page.locator('#model3d-open').click();await idle(page);await page.locator('#model3d-features li').first().locator('button').first().click();await idle(page);await pathButton(page,1).click();await applyTool(page);await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 4368.271 mm³');await page.locator('#model3d-cancel').click();expect((await stored(page)).features[0].profile).not.toEqual((await stored(page)).features[1].profile);
});

test('edge tools select actual CAD chains with touch, individual edges and error recovery',async({page})=>{
  await open(page);await addBox(page);await choose(page,'chamfer');await expect(page.locator('#model3d-shell')).toBeHidden();await expect(page.locator('#model3d-extrusion')).toBeHidden();
  await page.locator('[data-model-view=top]').click();const box=await page.locator('#model3d-viewer canvas').boundingBox(),span=160*25.4/96,height=120*25.4/96;
  const x=box.x+box.width/2,y=box.y+box.height*(.5-height/(2*(span*1.5-10*Math.tan(40*Math.PI/360))));
  await page.touchscreen.tap(x,y);await expect(page.locator('#model3d-edge-count')).toHaveText('4 edges selected.');await page.touchscreen.tap(x,y);await expect(page.locator('#model3d-preview')).toBeDisabled();
  await page.locator('#model3d-edge-advanced').evaluate(element=>element.open=true);await page.locator('#model3d-edge-picker').selectOption('0');await page.locator('#model3d-edge-size').fill('0.5');await applyTool(page);
  await editLast(page);await page.locator('#model3d-edge-size').fill('999');await page.locator('#model3d-preview').click();await expect(page.locator('#model3d-status')).toHaveClass(/model3d-error/,{timeout:90000});await page.locator('#model3d-edge-size').fill('0.5');await expect(page.locator('#model3d-apply-tool')).toBeEnabled({timeout:90000});await page.locator('#model3d-apply-tool').click();
  await choose(page,'fillet');await page.locator('#model3d-edge-advanced').evaluate(element=>element.open=true);await page.locator('#model3d-edge-mode').selectOption('individual');await page.locator('#model3d-edge-advanced').evaluate(element=>element.open=true);await page.locator('#model3d-edge-picker').selectOption('0');await expect(page.locator('#model3d-edge-count')).toHaveText('1 edge selected.');await page.locator('#model3d-clear-edges').click();await expect(page.locator('#model3d-preview')).toBeDisabled();await page.locator('#model3d-cancel-tool').click();await idle(page);
  await page.locator('#model3d-apply').click();expect((await stored(page)).features[1]).toMatchObject({kind:'chamfer',amount:.5});
});

test('opening invalid metadata preserves the drawing and New clears a saved model with Undo',async({page})=>{
  await open(page);await addBox(page);await page.locator('#model3d-apply').click();const before=await snapshot(page);
  const bad=rectangle.replace('<path','<metadata id="vector-lab-model3d">{"version":2,"features":[]}</metadata><path');await page.locator('#file').setInputFiles({name:'bad.svg',mimeType:'image/svg+xml',buffer:Buffer.from(bad)});await expect(page.locator('#status')).toContainText('invalid or unsupported 3D model data');expect(await snapshot(page)).toBe(before);
  await page.locator('#file-menu-button').click();page.once('dialog',dialog=>dialog.accept());await page.locator('#new').click();expect(await stored(page)).toBeUndefined();await page.locator('#canvas-undo').click();expect((await stored(page)).features).toHaveLength(1);
});

test('the supplied junction chamfer and complex fish keep their editable edge references',async({page})=>{
  test.setTimeout(240000);await page.goto('/');page.once('dialog',dialog=>dialog.accept());await page.locator('#file').setInputFiles(new URL('../examples/stepped-block-3d.svg',import.meta.url).pathname);await expect(page.locator('#status')).toContainText('SVG opened');await page.locator('#model3d-open').click();await idle(page);await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 6031.333 mm³');await editLast(page);await expect(page.locator('#model3d-edge-count')).toHaveText('4 edges selected.');await page.locator('#model3d-cancel').click();
  const model=JSON.parse(await readFile(new URL('./fixtures/fish-chamfer.json',import.meta.url),'utf8'));await load(page,`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900"><metadata id="vector-lab-model3d">${JSON.stringify(model)}</metadata><path d="M10 10h100v50H10z" fill="teal"/></svg>`);
  await page.locator('#model3d-open').click();await idle(page);await expect(page.locator('#model3d-status')).toContainText('0.02 mm');await editLast(page);await expect(page.locator('#model3d-edge-count')).toHaveText('71 edges selected.');await preview(page);await expect(page.locator('#model3d-status')).toContainText('0.02 mm');await page.locator('#model3d-apply-tool').click();await page.locator('#model3d-apply').click();expect((await stored(page)).features[0].profile).toEqual(model.features[0].profile);
});
