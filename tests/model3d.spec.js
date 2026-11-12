import {test,expect} from '@playwright/test';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome',args:['--enable-unsafe-swiftshader']}});
test.setTimeout(90000);
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><path d="M0 0H160V120H0Z" fill="#508b87"/></svg>';
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].data?.model3d);
async function load(page){await page.goto('/');page.once('dialog',dialog=>dialog.accept());await page.locator('#file').setInputFiles({name:'profile.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');}
async function ready(page){await expect(page.locator('#model3d-apply')).toBeEnabled({timeout:60000});}

test('extrusion preview is reversible and applies one recoverable, editable SVG change',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await load(page);const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));
  await page.locator('#extrude-path').click();await ready(page);await page.locator('#model3d-height').fill('12');await page.locator('#model3d-draft').fill('5');await ready(page);
  expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
  await page.locator('#model3d-cancel').click();expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
  await page.locator('#extrude-path').click();await ready(page);await page.locator('#model3d-height').fill('12');await page.locator('#model3d-draft').fill('5');await ready(page);
  await page.locator('#model3d-apply').click();expect((await stored(page)).features[0].height).toBe(12);
  await page.locator('#canvas-undo').click();expect((await stored(page))?.features||[]).toHaveLength(0);await page.locator('#canvas-redo').click();expect((await stored(page)).features[0].draft).toBe(5);
  await page.reload();await page.locator('#model3d-open').click();await ready(page);await expect(page.locator('#model3d-height')).toHaveValue('12');await expect(page.locator('#model3d-features li')).toHaveCount(1);
  const stlEvent=page.waitForEvent('download');await page.locator('#model3d-stl').click();expect((await stlEvent).suggestedFilename()).toMatch(/\.stl$/);await ready(page);
  const stepEvent=page.waitForEvent('download');await page.locator('#model3d-step').click();expect((await stepEvent).suggestedFilename()).toMatch(/\.step$/);await ready(page);
  await page.locator('#model3d-cancel').click();await page.locator('#save').click();await expect(page.locator('#download-svg')).toBeEnabled();const event=page.waitForEvent('download');await page.locator('#download-svg').click();const file=await(await event).path();
  page.once('dialog',dialog=>dialog.accept());await page.locator('#file').setInputFiles(file);await expect(page.locator('#status')).toContainText('SVG opened');expect((await stored(page)).features[0].height).toBe(12);
  await page.locator('#model3d-open').click();await ready(page);await expect(page.locator('#model3d-draft')).toHaveValue('5');await page.screenshot({path:'/tmp/vector-lab-model3d-desktop.png'});expect(errors).toEqual([]);
});

test('edge treatments select actual CAD edges, validate input, and stay in the modal until applied',async({page})=>{
  await load(page);await page.locator('#extrude-path').click();await ready(page);
  await page.locator('#model3d-edge-picker').selectOption('0');await expect(page.locator('#model3d-chamfer')).toBeEnabled();await page.locator('#model3d-edge-size').fill('0.5');await page.locator('#model3d-chamfer').click();await ready(page);await expect(page.locator('#model3d-features li')).toHaveCount(2);
  await expect(page.locator('#model3d-treatment-help')).toContainText('4 edges');
  await page.locator('#model3d-treatment-size').fill('999');await expect(page.locator('#model3d-apply')).toBeDisabled();await expect(page.locator('#model3d-status')).toHaveClass(/model3d-error/,{timeout:60000});
  await page.locator('#model3d-treatment-size').fill('0.5');await ready(page);await page.locator('#model3d-apply').click();expect((await stored(page)).features[1].kind).toBe('chamfer');
});

test.describe('connected rim picking',()=>{
  test.use({hasTouch:true});
  test('mouse and touch pick a whole rim, with individual selection and clear available',async({page})=>{
    await load(page);const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));
    await page.locator('#extrude-path').click();await ready(page);await page.locator('[data-model-view=top]').click();
    await expect(page.locator('#model3d-edge-mode')).toHaveValue('connected');await expect(page.locator('#model3d-edge-picker optgroup option')).toHaveCount(6);
    // Top-view perspective projects the upper rim slightly larger than a slice
    // through the model's center. Click its middle, away from corner ambiguity.
    const canvas=await page.locator('#model3d-viewer canvas').boundingBox(),height=120*25.4/96,span=160*25.4/96;
    const y=canvas.y+canvas.height*(.5-height/(2*(span*1.5-10*Math.tan(40*Math.PI/360)))),x=canvas.x+canvas.width/2;
    await page.mouse.click(x,y);await expect(page.locator('#model3d-edge-count')).toContainText('4 edges selected');
    await page.touchscreen.tap(x,y);await expect(page.locator('#model3d-edge-count')).toHaveText('Select an edge in the preview.');
    await page.touchscreen.tap(x,y);await expect(page.locator('#model3d-edge-count')).toContainText('4 edges selected');
    await page.locator('#model3d-edge-mode').selectOption('individual');await expect(page.locator('#model3d-edge-picker optgroup option')).toHaveCount(12);
    await page.mouse.click(x,y);await expect(page.locator('#model3d-edge-count')).toContainText('1 edge selected');
    await page.locator('#model3d-clear-edges').click();await expect(page.locator('#model3d-chamfer')).toBeDisabled();
    await page.locator('#model3d-edge-picker').selectOption('0');await expect(page.locator('#model3d-edge-count')).toContainText('1 edge selected');
    await page.locator('#model3d-edge-mode').selectOption('connected');await page.locator('#model3d-edge-picker').selectOption('0');await expect(page.locator('#model3d-edge-count')).toContainText('4 edges selected');
    await page.screenshot({path:'/tmp/vector-lab-connected-edge-selection.png'});await page.locator('#model3d-cancel').click();expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
  });
});

test('mobile modeling fits the viewport and new drawings clear the model with undo',async({page})=>{
  await page.setViewportSize({width:390,height:844});await load(page);await page.locator('#model3d-open').click();await ready(page);
  const box=await page.locator('#model3d-dialog').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.width).toBeLessThanOrEqual(390);
  await page.screenshot({path:'/tmp/vector-lab-model3d-mobile.png'});await page.locator('#model3d-apply').click();expect((await stored(page)).features).toHaveLength(1);
  await page.locator('#file-menu-button').click();page.once('dialog',dialog=>dialog.accept());await page.locator('#new').click();expect(await stored(page)).toBeUndefined();await page.locator('#canvas-undo').click();expect((await stored(page)).features).toHaveLength(1);
});

test('new raised and cutting features use the existing solid, with unit conversion and profile replacement',async({page})=>{
  await load(page);await page.locator('#extrude-path').click();await ready(page);await page.locator('#model3d-height').fill('3');await ready(page);await page.locator('#model3d-apply').click();
  const boss='<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><path d="M0 0H80V60H0Z" fill="blue"/></svg>';
  await page.locator('#image-file').setInputFiles({name:'boss.svg',mimeType:'image/svg+xml',buffer:Buffer.from(boss)});await expect(page.locator('#status')).toContainText('SVG artwork stays editable');
  await page.locator('#model3d-open').click();await ready(page);await page.locator('#model3d-add').click();await page.locator('#model3d-operation').selectOption('join');await page.locator('#model3d-height').fill('15');await ready(page);
  await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 8064.5 mm³');
  await page.locator('#model3d-unit').selectOption('in');await ready(page);expect(Number(await page.locator('#model3d-height').inputValue())).toBeCloseTo(15/25.4,6);
  await page.locator('#model3d-unit').selectOption('mm');await ready(page);await page.locator('#model3d-add').click();await page.locator('#model3d-operation').selectOption('cut');await page.locator('#model3d-height').fill('2');await page.locator('#model3d-start').fill('13');await ready(page);
  await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 7392.458 mm³');await page.locator('#model3d-apply').click();expect((await stored(page)).features.map(feature=>feature.operation)).toEqual(['new','join','cut']);
  await page.locator('#model3d-open').click();await ready(page);await page.locator('#model3d-features li').first().locator('button').first().click();await page.locator('#model3d-replace').click();await ready(page);
  await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 4368.271 mm³');await page.locator('#model3d-cancel').click();expect((await stored(page)).features[0].profile[0].outer).not.toEqual((await stored(page)).features[1].profile[0].outer);
});

test('opening ordinary SVG replaces a model and invalid model metadata preserves the current drawing',async({page})=>{
  await load(page);await page.locator('#extrude-path').click();await ready(page);await page.locator('#model3d-apply').click();const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));
  const bad=svg.replace('<path','<metadata id="vector-lab-model3d">{"version":2,"features":[]}</metadata><path');
  await page.locator('#file').setInputFiles({name:'bad-model.svg',mimeType:'image/svg+xml',buffer:Buffer.from(bad)});await expect(page.locator('#status')).toContainText('invalid or unsupported 3D model data');expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
  page.once('dialog',dialog=>dialog.accept());await page.locator('#file').setInputFiles({name:'plain.svg',mimeType:'image/svg+xml',buffer:Buffer.from(svg)});await expect(page.locator('#status')).toContainText('SVG opened');expect((await stored(page)).features).toHaveLength(0);
  await page.locator('#canvas-undo').click();expect((await stored(page)).features).toHaveLength(1);
});

test('the supplied stepped block reopens its junction chamfer and keeps all four edge references editable',async({page})=>{
  await page.goto('/');page.once('dialog',dialog=>dialog.accept());await page.locator('#file').setInputFiles(new URL('../examples/stepped-block-3d.svg',import.meta.url).pathname);await expect(page.locator('#status')).toContainText('SVG opened');
  await page.locator('#model3d-open').click();await ready(page);await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 6031.333 mm³');await expect(page.locator('#model3d-treatment-help')).toContainText('4 edges');
  await page.screenshot({path:'/tmp/vector-lab-model3d-junction.png'});
  await page.locator('#model3d-treatment-size').fill('0.5');await ready(page);await page.locator('#model3d-apply').click();expect((await stored(page)).features[2].amount).toBe(0.5);
  await page.reload();await page.locator('#model3d-open').click();await ready(page);await expect(page.locator('#model3d-treatment-size')).toHaveValue('0.5');await expect(page.locator('#model3d-treatment-help')).toContainText('4 edges');
});
