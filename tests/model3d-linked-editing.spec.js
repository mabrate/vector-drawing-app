import {test,expect} from '@playwright/test';
import {open,choose,idle,addBox,applyTool,stored,editLast,pathButton} from './model3d-helpers.js';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome',args:['--enable-unsafe-swiftshader']}});
test.setTimeout(120000);
const linkState=page=>page.locator('#model3d-link-status');
const ready=async page=>expect(linkState(page)).toHaveAttribute('data-state','ready',{timeout:90000});
async function savedBox(page,chamfer=false){
  await open(page);await addBox(page);
  if(chamfer){await choose(page,'chamfer');await page.locator('#model3d-edge-advanced').evaluate(element=>element.open=true);await page.locator('#model3d-edge-picker').selectOption('0');await page.locator('#model3d-edge-size').fill('0.5');await applyTool(page);}
  await page.locator('#model3d-apply').click();await page.keyboard.press('Control+a');
}
async function resizeWidth(page,width){
  await page.locator('#units').selectOption('mm',{force:true});
  if(await page.locator('#dimension-width').isHidden())await page.locator('#dimensions-toggle').click();
  await page.locator('#dimension-width').fill(String(width));await page.locator('#dimension-width').press('Enter');await page.locator('#canvas').focus();
}
async function svgRoundtrip(page){
  await page.locator('#save').click();await expect(page.locator('#download-svg')).toBeEnabled();const event=page.waitForEvent('download');await page.locator('#download-svg').click();const file=await event;
  const content=Buffer.concat(await(await file.createReadStream()).toArray()).toString();
  page.once('dialog',dialog=>dialog.accept());await page.locator('#file').setInputFiles(await file.path());await expect(page.locator('#status')).toContainText('SVG opened');await ready(page);return content;
}

test('source resize updates the extrusion automatically in the same Undo step and survives SVG and recovery',async({page})=>{
  await savedBox(page);const before=await stored(page);expect(before.features[0].sourceIds).toHaveLength(1);
  await resizeWidth(page,60);await ready(page);const resized=await stored(page);expect(resized.features[0].profile).not.toEqual(before.features[0].profile);expect(resized.features[0].sourceIds).toEqual(before.features[0].sourceIds);
  await page.locator('#canvas-undo').click();await ready(page);expect(await stored(page)).toEqual(before);await page.locator('#canvas-redo').click();await ready(page);expect(await stored(page)).toEqual(resized);
  await page.locator('#model3d-open').click();await idle(page);await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 19050 mm³');await page.locator('#model3d-cancel').click();
  const svg=await svgRoundtrip(page);expect(svg).toContain('model3dSourceId');expect((await stored(page)).features[0].sourceIds).toEqual(before.features[0].sourceIds);
  await page.keyboard.press('Control+a');await resizeWidth(page,70);await ready(page);await page.reload();await ready(page);await page.keyboard.press('Control+a');await resizeWidth(page,80);await ready(page);
  await page.locator('#model3d-open').click();await idle(page);await expect(page.locator('#model3d-summary')).toHaveText('1 solid group · 25400 mm³');
});

test('a path change breaking a chamfer names the feature and offers Undo without undoing the wrong action',async({page})=>{
  await savedBox(page,true);const before=await stored(page);
  await page.keyboard.press('ArrowRight');await page.locator('#stroke-cap').selectOption('round');
  await expect(linkState(page)).toHaveAttribute('data-state','broken',{timeout:90000});await expect(linkState(page)).toContainText('Chamfer');await expect(linkState(page)).toContainText('selected edge changed');
  await expect(page.locator('#model3d-link-undo')).toHaveText('Undo path edit and later changes');await page.screenshot({path:'/tmp/vector-lab-linked-model-warning.png'});
  await page.locator('#model3d-link-undo').click();await ready(page);expect(await stored(page)).toEqual(before);await expect(linkState(page)).toBeHidden();
  await page.locator('#canvas-redo').click();await expect(linkState(page)).toHaveAttribute('data-state','broken',{timeout:90000});await page.locator('#model3d-link-keep').click();await expect(linkState(page)).toBeHidden();
  await page.keyboard.press('Control+a');await page.locator('#stroke-cap').selectOption('square');await expect(linkState(page)).toBeHidden();
});

test('deleting a source preserves a readable recipe, blocks stale 3D exports and can be undone',async({page})=>{
  await savedBox(page);const before=await stored(page);await page.keyboard.press('Delete');
  await expect(linkState(page)).toHaveAttribute('data-state','broken');await expect(linkState(page)).toContainText('deleted or replaced');expect((await stored(page)).features[0].sourceError).toMatch(/deleted/);
  await page.locator('#model3d-link-repair').click();await idle(page);await expect(page.locator('#model3d-stl')).toBeDisabled();await expect(page.locator('#model3d-apply')).toBeDisabled();await page.locator('#model3d-cancel').click();
  await page.locator('#model3d-link-undo').click();await ready(page);expect(await stored(page)).toEqual(before);
});

test('duplicating a linked path and moving the copy does not retarget the extrusion',async({page})=>{
  await savedBox(page);const before=await stored(page);await page.locator('#duplicate').click();await page.keyboard.press('ArrowRight');await ready(page);expect(await stored(page)).toEqual(before);
  const ids=await page.evaluate(()=>{
    const children=JSON.parse(localStorage.getItem('vector-lab'))[1].children;return children.map(item=>item[1].data?.model3dSourceId).filter(Boolean);
  });expect(ids).toEqual(before.features[0].sourceIds);
});

test('stale asynchronous validation cannot warn or overwrite the document after Undo',async({page})=>{
  await page.addInitScript(()=>{
    const NativeWorker=window.Worker;window.__linkChecks=[];
    window.Worker=class extends NativeWorker{
      postMessage(data,...rest){
        if(data.type!=='validate')return super.postMessage(data,...rest);
        window.__linkChecks.push(data.id);const first=window.__linkChecks.length===1;
        setTimeout(()=>this.dispatchEvent(new MessageEvent('message',{data:{id:data.id,...(first?{error:'Stale validation failure'}:{valid:true})}})),first?600:20);
      }
    };
  });
  await savedBox(page);const before=await stored(page);await page.keyboard.press('ArrowRight');await expect.poll(()=>page.evaluate(()=>window.__linkChecks.length)).toBe(1);
  await page.locator('#canvas-undo').click();await ready(page);expect(await stored(page)).toEqual(before);expect(await page.evaluate(()=>window.__linkChecks.length)).toBe(2);await expect(linkState(page)).toBeHidden();
});

test('broken source links can be relinked to replacement paths through the 3D feature editor',async({page})=>{
  await savedBox(page);await page.keyboard.press('Delete');await expect(linkState(page)).toHaveAttribute('data-state','broken');await page.locator('#model3d-link-keep').click();
  await page.locator('#image-file').setInputFiles({name:'replacement.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="100"><path d="M0 0h120v100H0z" fill="blue"/></svg>')});await expect(page.locator('#status')).toContainText('SVG artwork stays editable');
  await page.locator('#model3d-open').click();await idle(page);await editLast(page);await pathButton(page).click();await applyTool(page);await page.locator('#model3d-apply').click();await ready(page);expect((await stored(page)).features[0].sourceError).toBeUndefined();
  await page.keyboard.press('Control+a');await page.keyboard.press('ArrowRight');await ready(page);await expect(linkState(page)).toBeHidden();
});

test('older copied profiles are linked on SVG open when the matching artwork is unambiguous',async({page})=>{
  await savedBox(page);const svg=await svgRoundtrip(page);
  const legacy=await page.evaluate(text=>{
    const doc=new DOMParser().parseFromString(text,'image/svg+xml'),metadata=doc.querySelector('#vector-lab-model3d'),model=JSON.parse(metadata.textContent);
    for(const feature of model.features)delete feature.sourceIds;metadata.textContent=JSON.stringify(model);
    for(const item of doc.querySelectorAll('[data-paper-data]')){const data=JSON.parse(item.getAttribute('data-paper-data'));delete data.model3dSourceId;item.setAttribute('data-paper-data',JSON.stringify(data));}
    return new XMLSerializer().serializeToString(doc);
  },svg);
  page.once('dialog',dialog=>dialog.accept());await page.locator('#file').setInputFiles({name:'legacy.svg',mimeType:'image/svg+xml',buffer:Buffer.from(legacy)});await expect(page.locator('#status')).toContainText('SVG opened');await ready(page);
  const before=await stored(page);expect(before.features[0].sourceIds).toHaveLength(1);await page.keyboard.press('Control+a');await resizeWidth(page,60);await ready(page);expect((await stored(page)).features[0].profile).not.toEqual(before.features[0].profile);
});
