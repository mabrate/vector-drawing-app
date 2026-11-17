import {test,expect} from '@playwright/test';
import {open,load,idle,choose,preview,applyTool,stored,snapshot,editLast} from './model3d-helpers.js';
import {sealPixels} from '../src/model3d-seal.js';
import {closedBinarySTL} from './helpers/model3d-stl.js';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome',args:['--enable-unsafe-swiftshader']},hasTouch:true});
test.setTimeout(240000);
const motif='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="24"><path id="Seal_motif" d="M0 0H120V24H0Z M12 6V18H24V6Z M54 6V18H72V6Z" fill="#000" fill-rule="evenodd"/></svg>';

async function roundtrip(page){
  await page.locator('#save').click();const event=page.waitForEvent('download');await page.locator('#download-svg').click();const file=await(await event).path();
  page.once('dialog',dialog=>dialog.accept());await page.locator('#file').setInputFiles(file);await expect(page.locator('#status')).toContainText('SVG opened');
}

test('path seals retain sizing, repeats, depth, preview boundaries, STL, undo, SVG and recovery',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await open(page,motif);const before=await snapshot(page);await choose(page,'seal');await page.locator('#model3d-seal-surface').selectOption('cad');
  await expect(page.locator('#model3d-seal-source-size')).toContainText('31.75 × 6.35 mm');
  await expect(page.locator('#model3d-seal-depth')).toHaveValue('1');await expect(page.locator('#model3d-seal-mirror')).toBeChecked();
  const diameter=Number(await page.locator('#model3d-seal-diameter').inputValue());expect(diameter).toBeCloseTo(31.75/Math.PI,5);
  await page.locator('#model3d-seal-around').fill('2');expect(Number(await page.locator('#model3d-seal-diameter').inputValue())).toBeCloseTo(diameter*2,5);
  await page.locator('#model3d-seal-vertical').fill('2');await expect(page.locator('#model3d-seal-size')).toContainText('Height 12.7 mm');
  await page.locator('#model3d-seal-diameter').fill('25');await expect(page.locator('#model3d-seal-size')).toContainText('blank wrap 15.039816 mm');
  await page.locator('#model3d-seal-around').fill('');await expect(page.locator('#model3d-preview')).toBeDisabled();await page.locator('#model3d-seal-around').fill('3');expect(Number(await page.locator('#model3d-seal-diameter').inputValue())).toBeCloseTo(25+31.75/Math.PI,5);await page.locator('#model3d-seal-around').fill('2');
  await page.locator('#model3d-seal-marginTop').fill('1.25');await page.locator('#model3d-seal-marginBottom').fill('2.5');await page.locator('#model3d-seal-effect').selectOption('emboss');await page.locator('#model3d-seal-draftAngle').fill('45');await expect(page.locator('#model3d-seal-size')).toContainText('Height 16.45 mm');
  await page.locator('#model3d-seal-depth').fill('0.6');await page.locator('#model3d-seal-detail').fill('1');
  await page.locator('#model3d-unit').selectOption('in');expect(Number(await page.locator('#model3d-seal-depth').inputValue())).toBeCloseTo(.6/25.4,6);await page.locator('#model3d-unit').selectOption('mm');
  await preview(page);expect(await snapshot(page)).toBe(before);await page.locator('#model3d-cancel-tool').click();await idle(page);await expect(page.locator('#model3d-features li')).toHaveCount(0);
  await choose(page,'seal');await page.locator('#model3d-seal-surface').selectOption('cad');await page.locator('#model3d-seal-around').fill('2');await page.locator('#model3d-seal-vertical').fill('2');await page.locator('#model3d-seal-diameter').fill('25');await page.locator('#model3d-seal-marginTop').fill('1.25');await page.locator('#model3d-seal-marginBottom').fill('2.5');await page.locator('#model3d-seal-effect').selectOption('emboss');await page.locator('#model3d-seal-draftAngle').fill('45');await page.locator('#model3d-seal-depth').fill('0.6');await page.locator('#model3d-seal-detail').fill('1');await applyTool(page);
  const event=page.waitForEvent('download');await page.locator('#model3d-stl').click();const download=await event,bytes=Buffer.concat(await(await download.createReadStream()).toArray());expect(closedBinarySTL(bytes)).toBe(true);await idle(page);
  await page.screenshot({path:'/tmp/vector-lab-cylinder-seal.png'});await page.locator('#model3d-apply').click();const model=await stored(page),feature=model.features[0];
  expect(feature).toMatchObject({kind:'seal',around:2,vertical:2,diameter:25,depth:.6,effect:'emboss',draftAngle:45,marginTop:1.25,marginBottom:2.5,engrave:'darkest',mirror:true});expect(feature.source.width).toBeCloseTo(31.75,6);expect(feature.source.height).toBeCloseTo(6.35,6);expect(Array.from(sealPixels(feature.source)).filter((v,i)=>i%2).some(a=>a===0)).toBe(true);
  await page.locator('#canvas-undo').click();expect((await stored(page))?.features||[]).toHaveLength(0);await page.locator('#canvas-redo').click();expect(await stored(page)).toEqual(model);
  await page.reload();await page.locator('#model3d-open').click();await idle(page);await editLast(page);await expect(page.locator('#model3d-seal-diameter')).toHaveValue('25');await expect(page.locator('#model3d-seal-vertical')).toHaveValue('2');await expect(page.locator('#model3d-seal-marginTop')).toHaveValue('1.25');await expect(page.locator('#model3d-seal-marginBottom')).toHaveValue('2.5');await expect(page.locator('#model3d-seal-effect')).toHaveValue('emboss');await expect(page.locator('#model3d-seal-draftAngle')).toHaveValue('45');await expect(page.locator('#model3d-seal-source')).toHaveValue('');await page.locator('#model3d-cancel').click();
  await roundtrip(page);expect(await stored(page)).toEqual(model);expect(errors).toEqual([]);
});

test('image seals use displayed image size, luminance and transparency, and settings fit a phone',async({page})=>{
  await page.goto('/');
  const png=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=120;canvas.height=24;const c=canvas.getContext('2d');c.fillStyle='#000';c.fillRect(0,0,30,24);c.fillStyle='#808080';c.fillRect(30,0,30,24);c.fillStyle='#fff';c.fillRect(60,0,30,24);return canvas.toDataURL();});
  await page.locator('#image-file').setInputFiles({name:'seal-values.png',mimeType:'image/png',buffer:Buffer.from(png.split(',')[1],'base64')});await expect(page.locator('#status')).toContainText('Image inserted');
  await page.locator('#model3d-open').click();await idle(page);await choose(page,'seal');
  await expect(page.locator('#model3d-tool-error')).toHaveText('');
  await expect(page.locator('#model3d-preview')).toBeEnabled();await expect(page.locator('#model3d-seal-source-size')).toContainText('31.75 × 6.35 mm');
  await expect(page.locator('#model3d-seal-effect')).toHaveValue('deboss');await expect(page.locator('#model3d-seal-marginTop')).toHaveValue('0');await page.locator('#model3d-seal-marginTop').fill('-1');await expect(page.locator('#model3d-preview')).toBeDisabled();await expect(page.locator('#model3d-tool-error')).toContainText('nonnegative');await page.locator('#model3d-seal-marginTop').fill('1');await page.locator('#model3d-seal-marginBottom').fill('2');
  await page.locator('#model3d-seal-engrave').selectOption('lightest');await page.locator('#model3d-seal-mirror').uncheck();await page.locator('#model3d-seal-detail').fill('1');await preview(page);await page.locator('#model3d-seal-depth').fill('0.5');await expect(page.locator('#model3d-apply-tool')).toBeEnabled({timeout:90000});const debossSummary=await page.locator('#model3d-summary').textContent();await page.locator('#model3d-seal-effect').selectOption('emboss');await expect(page.locator('#model3d-apply-tool')).toBeEnabled({timeout:90000});await expect(page.locator('#model3d-summary')).not.toHaveText(debossSummary);await page.locator('#model3d-apply-tool').click();await page.locator('#model3d-apply').click();
  expect((await stored(page)).features[0]).toMatchObject({depth:.5,effect:'emboss',marginTop:1,marginBottom:2});
  const source=(await stored(page)).features[0].source,values=Array.from(sealPixels(source));const at=u=>values.slice((Math.floor(source.rows/2)*source.columns+Math.floor(source.columns*u))*2,(Math.floor(source.rows/2)*source.columns+Math.floor(source.columns*u))*2+2);
  expect(at(.125)).toEqual([0,255]);expect(at(.375)).toEqual([128,255]);expect(at(.625)).toEqual([255,255]);expect(at(.875)[1]).toBe(0);
  await page.locator('#model3d-open').click();await idle(page);await editLast(page);await expect(page.locator('#model3d-seal-engrave')).toHaveValue('lightest');await expect(page.locator('#model3d-seal-effect')).toHaveValue('emboss');await expect(page.locator('#model3d-seal-marginTop')).toHaveValue('1');await expect(page.locator('#model3d-seal-marginBottom')).toHaveValue('2');await expect(page.locator('#model3d-seal-mirror')).not.toBeChecked();
  await page.locator('#model3d-seal-detail').fill('0.02');await page.locator('#model3d-unit').selectOption('in');await page.locator('#model3d-name').fill('Photo at minimum detail');await expect(page.locator('#model3d-tool-error')).toHaveText('');await page.locator('#model3d-unit').selectOption('mm');await expect(page.locator('#model3d-seal-detail')).toHaveValue('0.02');await expect(page.locator('#model3d-seal-marginTop')).toHaveValue('1');await expect(page.locator('#model3d-seal-marginBottom')).toHaveValue('2');
  await page.locator('#model3d-seal-diameter').fill('1');await expect(page.locator('#model3d-tool-error')).toContainText('Diameter must fit');await expect(page.locator('#model3d-preview')).toBeDisabled();await page.locator('#model3d-seal-fit').click();await expect(page.locator('#model3d-preview')).toBeEnabled();
  await page.setViewportSize({width:390,height:844});await page.locator('#model3d-seal').scrollIntoViewIfNeeded();expect(await page.locator('#model3d-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await expect(page.locator('#model3d-apply')).toBeInViewport();await page.screenshot({path:'/tmp/vector-lab-cylinder-seal-mobile.png'});
  await page.locator('#model3d-cancel').click();
});

test('empty drawings explain how to choose seal artwork',async({page})=>{
  await page.goto('/');await page.locator('#model3d-open').click();await idle(page);await choose(page,'seal');await expect(page.locator('#model3d-tool-error')).toContainText('Choose an image or path');await expect(page.locator('#model3d-preview')).toBeDisabled();
});


test('seal snapshots preserve cropped images under nested transforms without mutating artwork',async({page})=>{
  await page.goto('/');
  const result=await page.evaluate(async()=>{
    const {default:base}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name);
    const {sealArtwork,snapshotSealArtwork,sealPixels}=await import('/src/model3d-seal.js');
    const paper=new base.PaperScope();paper.setup(document.createElement('canvas'));
    const canvas=document.createElement('canvas');canvas.width=120;canvas.height=24;const ctx=canvas.getContext('2d');ctx.fillStyle='#000';ctx.fillRect(0,0,30,24);ctx.fillStyle='#808080';ctx.fillRect(30,0,30,24);ctx.fillStyle='#fff';ctx.fillRect(60,0,30,24);
    const raster=new paper.Raster({image:canvas,insert:false});raster.position=[60,12];
    const mask=new paper.Path.Rectangle({rectangle:[30,0,60,24],insert:false});mask.clipMask=true;
    const crop=new paper.Group({children:[mask,raster],insert:false});crop.applyMatrix=false;
    const parent=new paper.Group([crop]);parent.applyMatrix=false;parent.scale(2);parent.rotate(90);parent.translate([180.3,170.7]);
    const before=parent.exportJSON(),children=paper.project.activeLayer.children.length,entries=sealArtwork(paper,[parent],[parent]);
    const source=snapshotSealArtwork(paper,entries[0],25.4/96);
    const values=Array.from(sealPixels(source));const at=v=>values.slice((Math.floor(v*source.rows)*source.columns+Math.floor(source.columns/2))*2,(Math.floor(v*source.rows)*source.columns+Math.floor(source.columns/2))*2+2);
    const result={width:source.width,height:source.height,top:at(.25),bottom:at(.75),same:before===parent.exportJSON(),sameCount:children===paper.project.activeLayer.children.length,selected:entries[0].selected};paper.project.remove();return result;
  });
  expect(result).toMatchObject({top:[128,255],bottom:[255,255],same:true,sameCount:true,selected:true});expect(result.width).toBeCloseTo(48*25.4/96,6);expect(result.height).toBeCloseTo(120*25.4/96,6);
});

test('fine photo detail retains over 256 source samples, exports dense STL and recovers its settings',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/');
  const png=await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=768;canvas.height=1024;const ctx=canvas.getContext('2d'),image=ctx.createImageData(768,1024);
    for(let y=0;y<1024;y++)for(let x=0;x<768;x++){const i=(y*768+x)*4,v=Math.round(128+50*Math.sin(x*.4)*Math.cos(y*.3));image.data.set([v,v,v,255],i);}ctx.putImageData(image,0,0);return canvas.toDataURL().split(',')[1];
  });
  await page.locator('#image-file').setInputFiles({name:'portrait-detail.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await expect(page.locator('#status')).toContainText('Image inserted');
  const before=await snapshot(page);await page.locator('#model3d-open').click();await idle(page);await choose(page,'seal');
  await expect(page.locator('#model3d-seal-surface')).toHaveValue('photo');await expect(page.locator('#model3d-seal-source-size')).toContainText('768 × 1024 samples');
  await page.locator('#model3d-seal-photo-detail').click();await expect(page.locator('#model3d-seal-detail')).toHaveValue('0.05');await expect(page.locator('#model3d-seal-detail-summary')).toContainText('Surface limit reached');
  await preview(page);expect(await snapshot(page)).toBe(before);await page.screenshot({path:'/tmp/vector-lab-photo-seal-detail.png'});await page.locator('#model3d-apply-tool').click();await expect(page.locator('#model3d-step')).toBeDisabled();
  const downloading=page.waitForEvent('download');await page.locator('#model3d-stl').click();const download=await downloading,bytes=Buffer.concat(await(await download.createReadStream()).toArray());expect(bytes.readUInt32LE(80)).toBeGreaterThan(900000);expect(bytes.length).toBe(84+bytes.readUInt32LE(80)*50);await idle(page);
  await page.locator('#model3d-apply').click();const model=await stored(page);expect(model.features[0]).toMatchObject({surface:'photo',detail:.05});expect(model.features[0].source.packed.length).toBeLessThan(1100000);
  await roundtrip(page);expect(await stored(page)).toEqual(model);
  await page.reload();await page.locator('#model3d-open').click();await idle(page);await editLast(page);await expect(page.locator('#model3d-seal-detail')).toHaveValue('0.05');await expect(page.locator('#model3d-seal-surface')).toHaveValue('photo');await expect(page.locator('#model3d-seal-refresh')).toBeEnabled();
  const diameter=await page.locator('#model3d-seal-diameter').inputValue();await page.locator('#model3d-seal-refresh').click();await expect(page.locator('#model3d-seal-diameter')).toHaveValue(diameter);
  await page.locator('#model3d-seal-surface').selectOption('cad');await expect(page.locator('#model3d-seal-detail')).toHaveValue('0.1');await applyTool(page);await expect(page.locator('#model3d-step')).toBeEnabled();
  await page.locator('#model3d-cancel').click();expect(await stored(page)).toEqual(model);expect(errors).toEqual([]);
});

test('an older saved seal can refresh its low-resolution artwork and upgrade without changing diameter',async({page})=>{
  const legacy={version:1,features:[{id:'old-seal',name:'Older seal',kind:'seal',operation:'new',target:null,source:{name:'Seal_motif',width:31.75,height:6.35,columns:2,rows:2,pixels:[0,255,128,255,128,255,255,255]},around:1,vertical:1,diameter:25,depth:1,detail:.4,engrave:'darkest',mirror:true}]};
  await open(page,motif.replace('<path',`<metadata id="vector-lab-model3d">${JSON.stringify(legacy)}</metadata><path`));await editLast(page);
  await expect(page.locator('#model3d-seal-surface')).toHaveValue('cad');await expect(page.locator('#model3d-seal-draftAngle')).toHaveValue('0');await expect(page.locator('#model3d-seal-draftAngle')).toBeDisabled();await expect(page.locator('#model3d-seal-effect')).toHaveValue('deboss');await expect(page.locator('#model3d-seal-marginTop')).toHaveValue('0');await expect(page.locator('#model3d-seal-marginBottom')).toHaveValue('0');await expect(page.locator('#model3d-seal-detail-summary')).toContainText('saved artwork has low resolution');
  await page.locator('#model3d-seal-refresh').click();await expect(page.locator('#model3d-seal-source-size')).toContainText('1024 × 205 samples');await expect(page.locator('#model3d-seal-diameter')).toHaveValue('25');
  await page.locator('#model3d-seal-photo-detail').click();await applyTool(page);await page.locator('#model3d-apply').click();
  const feature=(await stored(page)).features[0];expect(feature).toMatchObject({id:'old-seal',surface:'photo',diameter:25,detail:.05});expect(feature.source.pixels).toBeUndefined();expect(feature.source.columns).toBe(1024);
});

test('raised path draft updates the preview, validates its angle, exports, and survives edit cancellation and SVG reopening',async({page})=>{
  const sharp='<svg xmlns="http://www.w3.org/2000/svg" width="160" height="120"><path id="Sharp_pattern" d="M10 95H150V65H110V25H50V65H10Z" fill="black"/></svg>';
  await open(page,sharp);const before=await snapshot(page);await choose(page,'seal');await page.locator('#model3d-unit').selectOption('mm');await expect(page.locator('#model3d-seal-draftAngle')).toHaveValue('0');await expect(page.locator('#model3d-seal-draftAngle')).toBeDisabled();
  await page.locator('#model3d-seal-effect').selectOption('emboss');await expect(page.locator('#model3d-seal-draftAngle')).toBeEnabled();await page.locator('#model3d-seal-detail').fill('0.15');await page.locator('#model3d-seal-marginTop').fill('1');await page.locator('#model3d-seal-marginBottom').fill('1');await preview(page);
  const volume=async()=>Number((await page.locator('#model3d-summary').textContent()).match(/· ([\d.]+) mm³/)[1]),original=await volume();
  await page.locator('#model3d-seal-draftAngle').fill('45');await expect(page.locator('#model3d-apply-tool')).toBeEnabled({timeout:90000});expect(await volume()).toBeLessThan(original);expect(await snapshot(page)).toBe(before);await expect(page.locator('#model3d-seal-detail-summary')).toContainText('Draft 45°');
  await page.locator('#model3d-seal-draftAngle').fill('81');await expect(page.locator('#model3d-apply-tool')).toBeDisabled();await expect(page.locator('#model3d-tool-error')).toContainText('0° (off) to 80°');await page.locator('#model3d-seal-draftAngle').fill('45');await expect(page.locator('#model3d-apply-tool')).toBeEnabled({timeout:90000});
  await page.screenshot({path:'/tmp/vector-lab-seal-draft.png'});await page.locator('#model3d-apply-tool').click();const downloading=page.waitForEvent('download');await page.locator('#model3d-stl').click();const bytes=Buffer.concat(await(await(await downloading).createReadStream()).toArray());expect(closedBinarySTL(bytes)).toBe(true);await idle(page);await page.locator('#model3d-apply').click();
  const model=await stored(page);expect(model.features[0]).toMatchObject({effect:'emboss',draftAngle:45,marginTop:1,marginBottom:1});
  await page.locator('#model3d-open').click();await idle(page);await editLast(page);await expect(page.locator('#model3d-seal-draftAngle')).toHaveValue('45');await page.locator('#model3d-seal-draftAngle').fill('60');await preview(page);await page.locator('#model3d-cancel').click();expect(await stored(page)).toEqual(model);
  await roundtrip(page);expect(await stored(page)).toEqual(model);await page.locator('#model3d-open').click();await idle(page);await editLast(page);await expect(page.locator('#model3d-seal-draftAngle')).toHaveValue('45');
  await page.locator('#model3d-seal-draftAngle').fill('81');await page.locator('#model3d-seal-effect').selectOption('deboss');await expect(page.locator('#model3d-seal-draftAngle')).toBeDisabled();await expect(page.locator('#model3d-seal-draftAngle')).toHaveValue('0');await expect(page.locator('#model3d-preview')).toBeEnabled();
  await page.setViewportSize({width:390,height:844});await page.locator('#model3d-seal-effect').selectOption('emboss');await page.locator('#model3d-seal-draftAngle').fill('45');await page.locator('#model3d-seal-draftAngle').scrollIntoViewIfNeeded();expect(await page.locator('#model3d-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await expect(page.locator('#model3d-apply')).toBeInViewport();await page.screenshot({path:'/tmp/vector-lab-seal-draft-mobile.png'});await page.locator('#model3d-cancel').click();
});
