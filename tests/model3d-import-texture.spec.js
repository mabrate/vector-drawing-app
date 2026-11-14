import {test,expect} from '@playwright/test';
import {open,circle,idle,choose,addBox,preview,applyTool,stored,snapshot,editLast,center} from './model3d-helpers.js';
import {boxMesh,binarySTL,asciiSTL,closedBinarySTL} from './helpers/model3d-stl.js';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome',args:['--enable-unsafe-swiftshader']},hasTouch:true});
test.setTimeout(180000);
async function emptyWorkspace(page){await page.goto('/');await page.locator('#model3d-open').click();await idle(page);}
async function importFile(page,buffer=binarySTL(),name='Tinkercad box.stl'){await page.locator('#model3d-stl-file').setInputFiles({name,mimeType:'model/stl',buffer});await idle(page);}
const cap=(page,z)=>page.locator('#model3d-faces label').filter({hasText:`Z ${z} mm`}).locator('input');
async function svgRoundtrip(page){
  await page.locator('#save').click();await expect(page.locator('#download-svg')).toBeEnabled();const event=page.waitForEvent('download');await page.locator('#download-svg').click();const file=await(await event).path();
  page.once('dialog',dialog=>dialog.accept());await page.locator('#file').setInputFiles(file);await expect(page.locator('#status')).toContainText('SVG opened');
}

test('a student can import STL, chamfer its rim, export it, and reopen all features from SVG',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await emptyWorkspace(page);const before=await snapshot(page);
  await importFile(page,asciiSTL());await expect(page.locator('#model3d-import-summary')).toHaveText('12 triangles · 20 × 20 × 10 mm');await preview(page);await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 4000 mm³');expect(await snapshot(page)).toBe(before);
  await page.locator('#model3d-cancel-tool').click();await idle(page);await expect(page.locator('#model3d-features li')).toHaveCount(0);
  await importFile(page);await applyTool(page);await choose(page,'chamfer');await page.locator('[data-model-view=top]').click();
  const box=await page.locator('#model3d-viewer canvas').boundingBox(),x=box.x+box.width/2,y=box.y+box.height*(.5-20/(2*(20*1.5-10*Math.tan(40*Math.PI/360))));
  await page.touchscreen.tap(x,y);await expect(page.locator('#model3d-edge-count')).toHaveText('4 edges selected.');await page.locator('#model3d-edge-size').fill('0.5');await applyTool(page);await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 3990.167 mm³');
  await page.locator('[data-model-view=iso]').click();await page.screenshot({path:'/tmp/vector-lab-imported-stl-chamfer.png'});
  const event=page.waitForEvent('download');await page.locator('#model3d-stl').click();const download=await event,bytes=Buffer.concat(await(await download.createReadStream()).toArray());expect(closedBinarySTL(bytes)).toBe(true);await idle(page);
  await page.locator('#model3d-apply').click();const model=await stored(page);expect(model.features.map(feature=>feature.kind)).toEqual(['stl','chamfer']);
  await page.locator('#canvas-undo').click();expect((await stored(page))?.features||[]).toHaveLength(0);await page.locator('#canvas-redo').click();expect(await stored(page)).toEqual(model);
  await svgRoundtrip(page);expect(await stored(page)).toEqual(model);await page.locator('#model3d-open').click();await idle(page);await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 3990.167 mm³');await editLast(page);await expect(page.locator('#model3d-edge-size')).toHaveValue('0.5');expect(errors).toEqual([]);
});

test('STL import units can be corrected and malformed or open files preserve the model',async({page})=>{
  await emptyWorkspace(page);await importFile(page,Buffer.from('this is not a mesh'));await expect(page.locator('#model3d-status')).toHaveClass(/model3d-error/);await expect(page.locator('#model3d-features li')).toHaveCount(0);
  const mesh=boxMesh();mesh.triangles.splice(0,3);await importFile(page,asciiSTL(mesh));await expect(page.locator('#model3d-status')).toContainText('closed and manifold');
  await importFile(page,binarySTL(boxMesh(1,1,1)));await page.locator('#model3d-stl-units').selectOption('25.4');await expect(page.locator('#model3d-import-summary')).toContainText('25.4 × 25.4 × 25.4 mm');await applyTool(page);await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 16387.064 mm³');
  await page.locator('#model3d-apply').click();expect((await stored(page)).features[0].scale).toBe(25.4);
});

test('different raised and engraved patterns on separate surfaces save through history, SVG and recovery',async({page})=>{
  await open(page);const before=await snapshot(page);await addBox(page);await choose(page,'texture');await cap(page,10).check();await preview(page);await expect(page.locator('#model3d-features li')).toHaveCount(1);expect(await snapshot(page)).toBe(before);await page.locator('#model3d-apply-tool').click();
  await choose(page,'texture');await cap(page,0).check();await page.locator('#model3d-texture-pattern').selectOption('dots');await page.locator('#model3d-texture-mode').selectOption('engraved');await page.locator('#model3d-texture-spacing').fill('8');await page.locator('#model3d-texture-width').fill('2');await applyTool(page);
  await page.locator('[data-model-view=iso]').click();await page.screenshot({path:'/tmp/vector-lab-printable-surface-textures.png'});
  const event=page.waitForEvent('download');await page.locator('#model3d-stl').click();const download=await event,bytes=Buffer.concat(await(await download.createReadStream()).toArray());expect(closedBinarySTL(bytes)).toBe(true);await idle(page);
  await page.locator('#model3d-apply').click();const model=await stored(page);expect(model.features.map(feature=>feature.kind)).toEqual(['extrusion','texture','texture']);expect(model.features[1]).toMatchObject({pattern:'ribs',mode:'raised'});expect(model.features[2]).toMatchObject({pattern:'dots',mode:'engraved',spacing:8,width:2});
  await page.reload();await page.locator('#model3d-open').click();await idle(page);await editLast(page);await expect(page.locator('#model3d-texture-pattern')).toHaveValue('dots');await expect(page.locator('#model3d-texture-mode')).toHaveValue('engraved');await page.locator('#model3d-cancel').click();
  await svgRoundtrip(page);expect((await stored(page)).features.map(feature=>feature.kind)).toEqual(['extrusion','texture','texture']);
});

test('curved faces and overly dense patterns are explained and texture settings fit a phone',async({page})=>{
  await open(page,circle);await addBox(page);await choose(page,'texture');await expect(page.locator('#model3d-faces label').filter({hasText:'curved'}).first().locator('input')).toBeDisabled();
  await page.locator('[data-model-view=front]').click();let p=await center(page);await page.touchscreen.tap(p.x,p.y);await expect(page.locator('#model3d-status')).toContainText('flat face');await expect(page.locator('#model3d-preview')).toBeDisabled();
  await page.locator('[data-model-view=top]').click();p=await center(page);await page.touchscreen.tap(p.x,p.y);await page.locator('#model3d-texture-pattern').selectOption('dots');await page.locator('#model3d-texture-spacing').fill('0.1');await page.locator('#model3d-texture-width').fill('0.05');await page.locator('#model3d-preview').click();await expect(page.locator('#model3d-status')).toContainText('256',{timeout:90000});await expect(page.locator('#model3d-apply-tool')).toBeDisabled();
  await page.locator('#model3d-texture-spacing').fill('8');await page.locator('#model3d-texture-width').fill('1');await expect(page.locator('#model3d-apply-tool')).toBeEnabled({timeout:90000});
  await page.setViewportSize({width:390,height:844});await page.locator('#model3d-texture').scrollIntoViewIfNeeded();expect(await page.locator('#model3d-dialog').evaluate(element=>element.scrollWidth<=element.clientWidth)).toBe(true);await expect(page.locator('#model3d-apply')).toBeInViewport();await page.screenshot({path:'/tmp/vector-lab-printable-texture-mobile.png'});
  await page.locator('#model3d-cancel-tool').click();await idle(page);await page.locator('#model3d-cancel').click();
});

test('printable textures can be applied to flat faces of an imported STL',async({page})=>{
  await emptyWorkspace(page);await importFile(page);await applyTool(page);await choose(page,'texture');await cap(page,10).check();await page.locator('#model3d-texture-pattern').selectOption('squares');await page.locator('#model3d-texture-spacing').fill('5');await applyTool(page);await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 4008 mm³');await page.locator('#model3d-apply').click();expect((await stored(page)).features.map(feature=>feature.kind)).toEqual(['stl','texture']);
});
