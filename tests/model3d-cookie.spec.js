import {test,expect} from '@playwright/test';
import {open,idle,choose,preview,stored,snapshot,editLast} from './model3d-helpers.js';
import {closedBinarySTL} from './helpers/model3d-stl.js';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome',args:['--enable-unsafe-swiftshader']}});
test.setTimeout(120000);
const artwork='<svg xmlns="http://www.w3.org/2000/svg" width="220" height="160"><path id="Cut_outline" d="M20 20h180v120H20z" fill="#518d89"/><path id="Emboss_design" d="M80 60h40v30H80z" fill="#dc9b49"/></svg>';
const controls=page=>page.locator('#model3d-cookie');
async function setup(page){await open(page,artwork);await choose(page,'cookie');await page.locator('#model3d-cookie-emboss input').check();}
async function roundtrip(page){await page.locator('#save').click();const waiting=page.waitForEvent('download');await page.locator('#download-svg').click();const file=await(await waiting).path();page.once('dialog',dialog=>dialog.accept());await page.locator('#file').setInputFiles(file);await expect(page.locator('#status')).toContainText('SVG opened');}

test('cookie mode previews its wall, bottom base and drafted emboss without editing the drawing',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await setup(page);const before=await snapshot(page);
 await expect(controls(page)).toBeVisible();await expect(page.locator('#model3d-seal')).toBeHidden();await expect(page.locator('#model3d-extrusion')).toBeHidden();await expect(page.locator('#model3d-cookie-cut option:checked')).toHaveText('Cut_outline');
 await page.locator('#model3d-cookie-wallThickness').fill('1.2');await page.locator('#model3d-cookie-baseOffset').fill('4');await page.locator('#model3d-cookie-baseThickness').fill('2.5');await page.locator('#model3d-cookie-cutHeight').fill('16');await page.locator('#model3d-cookie-embossSetback').fill('3');await page.locator('#model3d-cookie-draftAngle').fill('4');
 await expect(page.locator('#model3d-cookie-size')).toContainText('Cutting top 18.5 mm');await expect(page.locator('#model3d-cookie-size')).toContainText('emboss top 15.5 mm');
 await preview(page);expect(await snapshot(page)).toBe(before);await page.screenshot({path:'/tmp/vector-lab-cookie-solid.png'});
 await page.locator('#model3d-cookie-baseMode').selectOption('open');await expect(page.locator('#model3d-apply-tool')).toBeEnabled({timeout:90000});await expect(page.locator('#model3d-cookie-bridgeWidth')).toBeVisible();await page.screenshot({path:'/tmp/vector-lab-cookie-open.png'});
 await page.locator('#model3d-cancel').click();expect(await snapshot(page)).toBe(before);expect(errors).toEqual([]);
});

test('open cutters retain bridges, editable settings, Undo, recovery, SVG and STL/STEP export',async({page})=>{
 await setup(page);const before=await snapshot(page);await page.locator('#model3d-cookie-baseMode').selectOption('open');await page.locator('#model3d-cookie-bridgeWidth').fill('2.2');await preview(page);await page.locator('#model3d-apply-tool').click();
 for(const format of ['stl','step']){const waiting=page.waitForEvent('download');await page.locator('#model3d-'+format).click();const bytes=Buffer.concat(await(await(await waiting).createReadStream()).toArray());if(format==='stl')expect(closedBinarySTL(bytes)).toBe(true);else expect(bytes.toString()).toContain('ISO-10303-21');await idle(page);}
 await page.locator('#model3d-apply').click();const model=await stored(page);expect(model.features[0]).toMatchObject({kind:'cookie',baseMode:'open',bridgeWidth:2.2,embossSetback:2,draftAngle:5});expect(model.features[0].emboss).toHaveLength(1);
 await page.locator('#canvas-undo').click();expect(await snapshot(page)).toBe(before);await page.locator('#canvas-redo').click();expect(await stored(page)).toEqual(model);
 await page.reload();await page.locator('#model3d-open').click();await idle(page);await editLast(page);await expect(page.locator('#model3d-cookie-baseMode')).toHaveValue('open');await expect(page.locator('#model3d-cookie-bridgeWidth')).toHaveValue('2.2');await expect(page.locator('#model3d-cookie-emboss input')).toBeChecked();
 await page.locator('#model3d-unit').selectOption('in');expect(Number(await page.locator('#model3d-cookie-cutHeight').inputValue())).toBeCloseTo(15/25.4,6);await page.locator('#model3d-name').fill('Cutter in inches');await page.locator('#model3d-unit').selectOption('mm');await expect(page.locator('#model3d-cookie-cutHeight')).toHaveValue('15');
 await page.locator('#model3d-cookie-draftAngle').fill('2');await preview(page);await page.locator('#model3d-cancel-tool').click();await idle(page);await page.locator('#model3d-apply').click();expect(await stored(page)).toEqual(model);
 await roundtrip(page);expect(await stored(page)).toEqual(model);
 await page.locator('#model3d-open').click();await idle(page);await editLast(page);await expect(page.locator('#model3d-cookie-emboss input')).toHaveCount(1);await expect(page.locator('#model3d-cookie-emboss input')).toBeChecked();await page.locator('#model3d-cancel').click();
});

test('cutter inputs explain invalid choices and fit phone controls',async({page})=>{
 await setup(page);await page.locator('#model3d-cookie-embossSetback').fill('15');await expect(page.locator('#model3d-preview')).toBeDisabled();await expect(page.locator('#model3d-tool-error')).toContainText('below the cutting edge');await page.locator('#model3d-cookie-embossSetback').fill('2');
 await page.locator('#model3d-cookie-baseOffset').fill('.5');await expect(page.locator('#model3d-preview')).toBeDisabled();await expect(page.locator('#model3d-tool-error')).toContainText('wall thickness');await page.locator('#model3d-cookie-baseOffset').fill('3');
 await page.setViewportSize({width:390,height:844});await page.locator('#model3d-cookie-emboss').scrollIntoViewIfNeeded();expect(await page.locator('#model3d-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await expect(page.locator('#model3d-apply')).toBeInViewport();await page.screenshot({path:'/tmp/vector-lab-cookie-mobile.png'});
 await page.locator('#model3d-cancel').click();
});
