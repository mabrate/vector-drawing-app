import {test,expect} from '@playwright/test';
import {open,addBox,choose,idle,preview,stored,snapshot} from './model3d-helpers.js';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome',args:['--enable-unsafe-swiftshader']},hasTouch:true});
test.setTimeout(120000);
async function topRim(page){
  const value=await page.locator('#model3d-edge-picker option').evaluateAll(options=>options.find(option=>option.textContent.includes('Outside rim · Z 10 mm'))?.value);
  expect(value).toBeDefined();await page.locator('#model3d-edge-advanced').evaluate(element=>element.open=true);await page.locator('#model3d-edge-picker').selectOption(value);
}
async function start(page){await open(page);await addBox(page);await choose(page,'chamfer');await topRim(page);}
async function svgRoundtrip(page){
  await page.locator('#save').click();const event=page.waitForEvent('download');await page.locator('#download-svg').click();const file=await event;
  page.once('dialog',dialog=>dialog.accept());await page.locator('#file').setInputFiles(await file.path());await expect(page.locator('#status')).toContainText('SVG opened');
}

test('recognized rims explain failure, offer a checked size without changing the request, and save optional preparation',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await start(page);const before=await snapshot(page);
  await expect(page.locator('#model3d-chamfer-description')).toContainText('Outside rim');await page.locator('#model3d-edge-size').fill('12');
  await expect(page.locator('#model3d-chamfer-description')).toContainText('wall height');await page.locator('#model3d-preview').click();await idle(page);
  await expect(page.locator('#model3d-status')).toContainText('wall height');await expect(page.locator('#model3d-apply-tool')).toBeDisabled();expect(await snapshot(page)).toBe(before);
  await page.locator('#model3d-chamfer-suggest').click();await expect(page.locator('#model3d-chamfer-use-size')).toHaveText('Preview 9 mm',{timeout:90000});await expect(page.locator('#model3d-edge-size')).toHaveValue('12');
  await page.locator('#model3d-chamfer-use-size').click();await expect(page.locator('#model3d-apply-tool')).toBeEnabled({timeout:90000});await expect(page.locator('#model3d-edge-size')).toHaveValue('9');
  await page.locator('#model3d-edit-selection').click();await idle(page);await page.locator('#model3d-edge-size').fill('1');await page.locator('#model3d-chamfer-prepare').check();await preview(page);
  await expect(page.locator('#model3d-status')).toContainText('0.03 mm');await page.locator('#model3d-apply-tool').click();await page.locator('#model3d-apply').click();
  const model=await stored(page);expect(model.features[1]).toMatchObject({amount:1,cleanupTolerance:.01,intent:{version:1,contours:[{kind:'outside-rim'}]}});
  await svgRoundtrip(page);expect(await stored(page)).toEqual(model);await page.locator('#model3d-open').click();await idle(page);await expect(page.locator('#model3d-status')).toContainText('0.03 mm');
  await page.screenshot({path:'/tmp/vector-lab-chamfer-reliability.png'});await page.locator('#model3d-cancel').click();
  await page.keyboard.press('Control+a');await page.keyboard.press('ArrowRight');await expect(page.locator('#model3d-link-status')).toHaveAttribute('data-state','ready',{timeout:90000});
  await page.locator('#model3d-open').click();await idle(page);await expect(page.locator('#model3d-status')).toContainText('0.03 mm');expect(errors).toEqual([]);
});

test('Cancel and the deadline interrupt a stalled calculation and preserve settings and the session',async({page})=>{
  await page.addInitScript(()=>{
    const NativeWorker=window.Worker;
    window.Worker=class extends NativeWorker{
      postMessage(message,...args){if(message.type==='build'&&message.model?.features.some(feature=>feature.kind==='chamfer'&&feature.amount===7))return;super.postMessage(message,...args);}
    };
  });
  await start(page);const before=await snapshot(page);await page.locator('#model3d-edge-size').fill('7');await page.locator('#model3d-preview').click();await expect(page.locator('#model3d-stop')).toBeVisible();await page.locator('#model3d-stop').click();await idle(page);
  await expect(page.locator('#model3d-status')).toContainText('canceled');await expect(page.locator('#model3d-edge-size')).toHaveValue('7');await expect(page.locator('#model3d-features li')).toHaveCount(1);expect(await snapshot(page)).toBe(before);
  await page.locator('#model3d-edge-size').fill('1');await preview(page);await page.locator('#model3d-edit-selection').click();await idle(page);
  await page.clock.install();await page.locator('#model3d-edge-size').fill('7');await page.locator('#model3d-preview').click();await page.clock.fastForward(120001);await idle(page);
  await expect(page.locator('#model3d-status')).toContainText('exceeded two minutes');await expect(page.locator('#model3d-retry')).toBeVisible();await expect(page.locator('#model3d-apply-tool')).toBeDisabled();expect(await snapshot(page)).toBe(before);
  await page.locator('#model3d-edge-size').fill('1');await expect(page.locator('#model3d-retry')).toBeHidden();await page.clock.resume();await preview(page);await page.locator('#model3d-apply-tool').click();await page.locator('#model3d-apply').click();expect((await stored(page)).features).toHaveLength(2);
});
