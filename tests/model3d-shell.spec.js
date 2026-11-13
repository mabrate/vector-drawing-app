import {test,expect} from '@playwright/test';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome',args:['--enable-unsafe-swiftshader']},hasTouch:true});
test.setTimeout(120000);
const circle='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="37.79527559055118" fill="teal"/></svg>';
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].data?.model3d);
const snapshot=page=>page.evaluate(()=>localStorage.getItem('vector-lab'));
async function ready(page){await expect(page.locator('#model3d-apply')).toBeEnabled({timeout:60000});}
async function open(page,svg=circle){
  await page.goto('/');page.once('dialog',dialog=>dialog.accept());
  await page.locator('#file').setInputFiles({name:'shell-profile.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});
  await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');
  await page.locator('#extrude-path').click();await ready(page);
}
const cap=(page,height,edit=false)=>page.locator(edit?'#model3d-shell-openings label':'#model3d-faces label').filter({hasText:`Z ${height} mm`}).locator('input');

test('face taps select a cap, checklists add hidden openings, and Cancel discards a tube',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await open(page);const before=await snapshot(page);
  await page.locator('#model3d-pick-mode').selectOption('faces');await page.locator('[data-model-view=top]').click();
  const canvas=await page.locator('#model3d-viewer canvas').boundingBox(),x=canvas.x+canvas.width/2,y=canvas.y+canvas.height/2;
  await page.mouse.click(x,y);await expect(page.locator('#model3d-face-count')).toHaveText('1 opening face selected.');await expect(cap(page,10)).toBeChecked();
  await page.touchscreen.tap(x,y);await expect(page.locator('#model3d-add-shell')).toBeDisabled();
  await page.touchscreen.tap(x,y);await cap(page,0).check();await expect(page.locator('#model3d-face-count')).toHaveText('2 opening faces selected.');
  await page.screenshot({path:'/tmp/vector-lab-shell-face-selection.png'});
  await page.locator('#model3d-add-shell').click();await ready(page);
  expect(await page.locator('.model3d-controls').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await expect(page.locator('#model3d-features li')).toHaveCount(2);await expect(page.locator('#model3d-shell-openings input:checked')).toHaveCount(2);
  await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 596.991 mm³');
  await page.locator('[data-model-view=iso]').click();await page.screenshot({path:'/tmp/vector-lab-shell-tube.png'});
  expect(await snapshot(page)).toBe(before);await page.locator('#model3d-cancel').click();expect(await snapshot(page)).toBe(before);expect(errors).toEqual([]);
});

test('shell edits validate thickness, change openings and direction, and survive Undo, recovery and SVG',async({page})=>{
  await open(page);await cap(page,10).check();await page.locator('#model3d-add-shell').click();await ready(page);
  await expect(page.locator('#model3d-shell-openings input:checked')).toHaveCount(1);
  await page.locator('#model3d-shell-thickness').fill('100');await expect(page.locator('#model3d-status')).toHaveClass(/model3d-error/,{timeout:60000});await expect(page.locator('#model3d-apply')).toBeDisabled();
  await page.locator('#model3d-shell-thickness').fill('2');await ready(page);
  await cap(page,0,true).check();await ready(page);await page.locator('#model3d-shell-direction').selectOption('outside');await ready(page);
  await page.locator('#model3d-unit').selectOption('in');await ready(page);expect(Number(await page.locator('#model3d-shell-thickness').inputValue())).toBeCloseTo(2/25.4,6);
  await page.locator('#model3d-unit').selectOption('mm');await ready(page);await expect(page.locator('#model3d-shell-thickness')).toHaveValue('2');
  await cap(page,0,true).uncheck();await ready(page);await cap(page,10,true).uncheck();await expect(page.locator('#model3d-status')).toHaveClass(/model3d-error/);await expect(page.locator('#model3d-apply')).toBeDisabled();
  await cap(page,0,true).check();await ready(page);await cap(page,10,true).check();await ready(page);
  await page.locator('#model3d-apply').click();const recipe=await stored(page);expect(recipe.features[1]).toMatchObject({kind:'shell',thickness:2,direction:'outside'});expect(recipe.features[1].faces).toHaveLength(2);
  await page.locator('#canvas-undo').click();expect((await stored(page))?.features||[]).toHaveLength(0);await page.locator('#canvas-redo').click();expect(await stored(page)).toEqual(recipe);
  await page.reload();await page.locator('#model3d-open').click();await ready(page);await expect(page.locator('#model3d-shell-thickness')).toHaveValue('2');await expect(page.locator('#model3d-shell-openings input:checked')).toHaveCount(2);
  for(const format of ['stl','step']){const download=page.waitForEvent('download');await page.locator(`#model3d-${format}`).click();expect((await download).suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));await ready(page);}
  await page.locator('#model3d-cancel').click();await page.locator('#save').click();const download=page.waitForEvent('download');await page.locator('#download-svg').click();const path=await(await download).path();
  page.once('dialog',dialog=>dialog.accept());await page.locator('#file').setInputFiles(path);await expect(page.locator('#status')).toContainText('SVG opened');expect(await stored(page)).toEqual(recipe);
  await page.locator('#model3d-open').click();await ready(page);await expect(page.locator('#model3d-shell-direction')).toHaveValue('outside');
  await page.locator('#model3d-features li').last().locator('button').last().click();await ready(page);await expect(page.locator('#model3d-features li')).toHaveCount(1);await expect(page.locator('#model3d-summary')).toContainText('3142.');
});

test('mobile shell controls fit and changing solids clears opening selection',async({page})=>{
  await page.setViewportSize({width:390,height:844});await open(page);
  await cap(page,10).check();await page.locator('#model3d-add').click();await ready(page);
  const options=await page.locator('#model3d-shell-target option').evaluateAll(options=>options.map(option=>option.value));expect(options).toHaveLength(2);
  await page.locator('#model3d-shell-target').selectOption(options[1]);await expect(page.locator('#model3d-add-shell')).toBeDisabled();
  await cap(page,10).check();await page.locator('#model3d-add-shell').click();await ready(page);
  await page.locator('#model3d-shell-edit').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/vector-lab-shell-mobile.png'});
  expect(await page.locator('#model3d-dialog').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);
  await page.locator('#model3d-apply').click();expect((await stored(page)).features[2].target).toBe(options[1]);
});

test('an initially invalid shell keeps its opening checklist available for correction',async({page})=>{
  await open(page);
  // Select every face, including surfaces hidden behind the cylinder.
  const count=await page.locator('#model3d-faces input').count();
  for(let index=0;index<count;index++)await page.locator('#model3d-faces input').nth(index).check();
  await page.locator('#model3d-add-shell').click();await expect(page.locator('#model3d-status')).toContainText('Keep at least one face');await expect(page.locator('#model3d-apply')).toBeDisabled();
  await expect(page.locator('#model3d-shell-openings input')).toHaveCount(count);
  for(let index=0;index<count-2;index++)await page.locator('#model3d-shell-openings input').nth(index).uncheck();
  await ready(page);await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 596.991 mm³');
});
