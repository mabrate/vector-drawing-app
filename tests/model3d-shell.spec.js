import {test,expect} from '@playwright/test';
import {circle,stored,snapshot,idle,open,choose,preview,applyTool,addBox,editLast,center} from './model3d-helpers.js';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome',args:['--enable-unsafe-swiftshader']},hasTouch:true});
test.setTimeout(120000);
const cap=(page,height)=>page.locator('#model3d-faces label').filter({hasText:`Z ${height} mm`}).locator('input');

test('the Shell tool picks caps with mouse and touch and preserves multiple inputs across previews',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await open(page,circle);const before=await snapshot(page);await addBox(page);await choose(page,'shell');
  await page.locator('[data-model-view=top]').click();const p=await center(page);await page.mouse.click(p.x,p.y);await expect(cap(page,10)).toBeChecked();await page.touchscreen.tap(p.x,p.y);await expect(cap(page,10)).not.toBeChecked();await page.touchscreen.tap(p.x,p.y);await cap(page,0).check();
  await expect(page.locator('#model3d-face-count')).toHaveText('2 opening faces selected.');await page.screenshot({path:'/tmp/vector-lab-workspace-selected-faces.png'});await preview(page);await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 596.991 mm³');await expect(cap(page,0)).toBeChecked();await expect(cap(page,10)).toBeChecked();
  await page.locator('#model3d-edit-selection').click();await idle(page);await expect(cap(page,0)).toBeChecked();await expect(cap(page,10)).toBeChecked();await cap(page,0).uncheck();await preview(page);await expect(page.locator('#model3d-summary')).not.toContainText('596.991');
  await page.locator('#model3d-edit-selection').click();await idle(page);await cap(page,0).check();await applyTool(page);await page.locator('[data-model-view=iso]').click();await page.screenshot({path:'/tmp/vector-lab-workspace-tube.png'});
  expect(await snapshot(page)).toBe(before);await page.locator('#model3d-cancel').click();expect(await snapshot(page)).toBe(before);expect(errors).toEqual([]);
});

test('shell history edits preview against the original faces and preserve thickness, direction, Undo and recovery',async({page})=>{
  await open(page,circle);await addBox(page);await choose(page,'shell');await cap(page,10).check();await applyTool(page);
  await editLast(page);await expect(cap(page,10)).toBeChecked();await cap(page,0).check();await page.locator('#model3d-shell-thickness').fill('2');await page.locator('#model3d-shell-direction').selectOption('outside');await applyTool(page);
  await page.locator('#model3d-apply').click();const recipe=await stored(page);expect(recipe.features[1]).toMatchObject({kind:'shell',thickness:2,direction:'outside'});expect(recipe.features[1].faces).toHaveLength(2);
  await page.locator('#canvas-undo').click();expect((await stored(page))?.features||[]).toHaveLength(0);await page.locator('#canvas-redo').click();expect(await stored(page)).toEqual(recipe);
  await page.reload();await page.locator('#model3d-open').click();await idle(page);await editLast(page);await expect(page.locator('#model3d-shell-thickness')).toHaveValue('2');await expect(page.locator('#model3d-shell-direction')).toHaveValue('outside');await expect(page.locator('#model3d-faces input:checked')).toHaveCount(2);
  await page.locator('#model3d-unit').selectOption('in');expect(Number(await page.locator('#model3d-shell-thickness').inputValue())).toBeCloseTo(2/25.4,6);await page.locator('#model3d-cancel-tool').click();await idle(page);
  for(const format of ['stl','step']){const event=page.waitForEvent('download');await page.locator(`#model3d-${format}`).click();expect((await event).suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));await idle(page);}
});

test('invalid shell offsets and all-face selections remain correctable before applying',async({page})=>{
  await open(page,circle);await addBox(page);await choose(page,'shell');await cap(page,10).check();await page.locator('#model3d-shell-thickness').fill('100');await page.locator('#model3d-preview').click();await expect(page.locator('#model3d-status')).toHaveClass(/model3d-error/,{timeout:90000});await expect(page.locator('#model3d-apply-tool')).toBeDisabled();
  await page.locator('#model3d-shell-thickness').fill('1');await expect(page.locator('#model3d-apply-tool')).toBeEnabled({timeout:90000});await page.locator('#model3d-edit-selection').click();await idle(page);
  const count=await page.locator('#model3d-faces input').count();for(let index=0;index<count;index++)await page.locator('#model3d-faces input').nth(index).check();
  await page.locator('#model3d-preview').click();await expect(page.locator('#model3d-status')).toContainText('Keep at least one face');await expect(page.locator('#model3d-apply-tool')).toBeDisabled();await page.locator('#model3d-edit-selection').click();await idle(page);
  for(let index=0;index<count-2;index++)await page.locator('#model3d-faces input').nth(index).uncheck();await applyTool(page);await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 596.991 mm³');
});
