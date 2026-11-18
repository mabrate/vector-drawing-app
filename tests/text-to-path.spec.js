import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {pathAction,openPathMenu} from './helpers/path-actions.js';
import {rotateSelection} from './helpers/canvas-transforms.js';
import {idle,applyTool,stored} from './model3d-helpers.js';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});

async function load(page,content){
 page.once('dialog',dialog=>dialog.accept());
 await page.locator('#file').setInputFiles({name:'lettering.svg',mimeType:'image/svg+xml',buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816">${content}</svg>`)});
 await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');
}
const state=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'),(key,value)=>typeof value==='number'?Number(value.toFixed(8)):value)[1].children);
const text='<text x="200" y="300" font-family="Arimo" font-size="80" fill="#52b7a4">BOO</text>';
async function output(page){
 await page.locator('#save').click();await expect(page.locator('#download-svg')).toBeEnabled();
 const waiting=page.waitForEvent('download');await page.locator('#download-svg').click();
 return Buffer.concat(await(await(await waiting).createReadStream()).toArray()).toString();
}
async function rememberCanvas(page){
 await page.locator('[data-tool=select]').click();await page.locator('#canvas').click({position:{x:12,y:12}});
 await page.locator('#canvas').evaluate(c=>{window.textBefore=c.getContext('2d').getImageData(0,0,c.width,c.height).data;});
 await page.keyboard.press('Control+a');
}
async function compareCanvas(page){
 await page.locator('[data-tool=select]').click();await page.locator('#canvas').click({position:{x:12,y:12}});
 return page.locator('#canvas').evaluate(c=>{
  const after=c.getContext('2d').getImageData(0,0,c.width,c.height).data,before=window.textBefore;let error=0,ink=0;
  for(let i=0;i<after.length;i+=4){error+=Math.max(...[0,1,2].map(j=>Math.abs(after[i+j]-before[i+j])))/255;if(before[i]===82&&before[i+1]===183&&before[i+2]===164)ink++;}
  return error/Math.max(1,ink);
 });
}

test('Text to Path preserves letter holes and appearance, edits nodes, and supports undo, recovery and SVG',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/');await load(page,text);await page.locator('#apply-text').click();
 await expect.poll(async()=>(await state(page))[0][0]).toBe('PointText');await rememberCanvas(page);
 await pathAction(page,'#text-to-path');await expect(page.locator('#status')).toContainText('Text converted');
 const converted=await state(page);expect(converted[0][0]).toBe('CompoundPath');expect(converted[0][1].children.length).toBeGreaterThan(6);
 expect(await compareCanvas(page)).toBeLessThan(.025);
 await page.locator('#canvas-undo').click();expect((await state(page))[0][0]).toBe('PointText');expect((await state(page))[0][1].content).toBe('BOO');
 await page.locator('#canvas-redo').click();expect(await state(page)).toEqual(converted);
 await page.reload();await expect.poll(()=>state(page)).toEqual(converted);
 const svg=await output(page);expect(svg).not.toContain('<text');expect(svg).toContain('<path');await load(page,svg);expect((await state(page))[0][0]).toBe('CompoundPath');
 await page.locator('[data-tool=nodes]').click();
 const anchor=await page.evaluate(async()=>{
  const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name);
  const child=paper.project.layers[1].firstChild.firstChild,p=paper.view.projectToView(child.localToGlobal(child.firstSegment.point)),r=document.querySelector('#canvas').getBoundingClientRect();return {x:r.x+p.x,y:r.y+p.y};
 });
 const beforeEdit=await state(page);await page.mouse.move(anchor.x,anchor.y);await page.mouse.down();await page.mouse.move(anchor.x+20,anchor.y+12,{steps:4});await page.mouse.up();expect(await state(page)).not.toEqual(beforeEdit);
 await page.locator('#canvas-undo').click();expect(await state(page)).toEqual(beforeEdit);expect(errors).toEqual([]);
});

test('wrapped, aligned, rotated bold italic underlined text keeps its geometry',async({page})=>{
 await page.goto('/');await load(page,text);await page.locator('#text-content').fill('BOO Wave lettering');
 await page.locator('#text-wrap').check();await page.locator('#text-box-width').fill('70');await page.locator('#text-size').fill('32');
 await page.locator('#text-letter-spacing').fill('2');await page.locator('#text-line-spacing').fill('1.7');await page.locator('#apply-text').click();
 for(const style of ['bold','italic','underline']){await page.locator('#text-'+style).click();await expect.poll(async()=>style==='bold'?(await state(page))[0][1].fontWeight:(await state(page))[0][1].data.textFormat[style]).toBe(style==='bold'?'bold':true);}
 await page.locator('[data-text-align=center]').click();await expect.poll(async()=>(await state(page))[0][1].justification).toBe('center');
 expect((await state(page))[0][1].content).toContain('\n');await rotateSelection(page,25);await rememberCanvas(page);
 await pathAction(page,'#text-to-path');await expect(page.locator('#status')).toContainText('Text converted');expect((await state(page))[0][0]).toBe('Group');expect(await compareCanvas(page)).toBeLessThan(.02);
 await page.keyboard.press('Control+a');await page.locator('#ungroup-objects').click();expect((await state(page)).every(item=>['CompoundPath','Path'].includes(item[0]))).toBe(true);
 await page.screenshot({path:'/tmp/vector-lab-text-to-path.png'});
});

test('selected groups keep their transforms, stacking and other artwork',async({page})=>{
 await page.goto('/');await load(page,`<path d="M40 40h50v50H40z" fill="red"/><g opacity=".6" transform="translate(40 50) rotate(12)">${text}<g opacity=".7">${text.replace('y="300"','y="450"')}<path d="M500 100h50v50h-50z" fill="blue"/></g></g>`);
 const before=await state(page);await pathAction(page,'#text-to-path');await expect(page.locator('#status')).toContainText('Text converted');
 const after=await state(page);expect(after[0]).toEqual(before[0]);expect(after[1][1].matrix).toEqual(before[1][1].matrix);expect(after[1][1].opacity).toBe(before[1][1].opacity);
 expect(JSON.stringify(after)).not.toContain('PointText');expect(JSON.stringify(after)).toContain('CompoundPath');
 await page.locator('#canvas-undo').click();expect(await state(page)).toEqual(before);await page.locator('#canvas-redo').click();expect(await state(page)).toEqual(after);
});

test('unsupported fonts leave every selected object intact',async({page})=>{
 await page.goto('/');await load(page,text+text.replace('Arimo','Missing Font').replace('y="300"','y="450"'));
 const before=await state(page);await pathAction(page,'#text-to-path');await expect(page.locator('#status')).toContainText('choose a font');expect(await state(page)).toEqual(before);
 await openPathMenu(page);await expect(page.locator('#text-to-path')).toBeEnabled();
});

test('a font finishing after the selection changes does not replace text',async({page})=>{
 let finishDownload;const gate=new Promise(resolve=>finishDownload=resolve),bytes=readFileSync(new URL('../public/fonts/arimo/400.ttf',import.meta.url));
 await page.route('https://fonts.gstatic.com/**',async route=>{await gate;await route.fulfill({status:200,contentType:'font/ttf',body:bytes});});
 await page.goto('/');await load(page,text.replace('Arimo','Bungee'));const before=await state(page);
 await pathAction(page,'#text-to-path');await expect(page.locator('#status')).toContainText('Converting text');
 await page.locator('#canvas').click({position:{x:12,y:12}});finishDownload();
 await expect(page.locator('#status')).toContainText('Drawing changed');expect(await state(page)).toEqual(before);
 await openPathMenu(page);await expect(page.locator('#text-to-path')).toBeDisabled();
});

test('an empty outline rolls back the whole selection after preparing other text',async({page})=>{
 await page.goto('/');await load(page,text+text.replace('BOO','   ').replace('y="300"','y="450"'));
 const before=await state(page);await pathAction(page,'#text-to-path');await expect(page.locator('#status')).toContainText('no visible outlines');expect(await state(page)).toEqual(before);
});

test('converted single-contour text extrudes at its position in the drawing',async({page})=>{
 test.setTimeout(120000);
 await page.goto('/');await load(page,text.replace('BOO','T'));
 await pathAction(page,'#text-to-path');await expect(page.locator('#status')).toContainText('Text converted');
 await rotateSelection(page,15);
 const expected=await page.evaluate(async()=>{
  const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name);
  const item=paper.project.layers[1].firstChild,b=item.bounds,factor=25.4/96;
  return {left:b.left*factor,right:b.right*factor,top:-b.bottom*factor,bottom:-b.top*factor};
 });
 await page.locator('#extrude-path').click();await idle(page);await applyTool(page);
 await expect(page.locator('#model3d-summary')).toContainText('1 solid group');
 await page.screenshot({path:'/tmp/vector-lab-text-extrusion-position.png'});
 await page.locator('#model3d-apply').click();
 const model=await stored(page),points=model.features[0].profile.flatMap(face=>face.outer.flat());
 const actual={left:Math.min(...points.map(p=>p[0])),right:Math.max(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),bottom:Math.max(...points.map(p=>p[1]))};
 for(const edge of Object.keys(expected))expect(actual[edge]).toBeCloseTo(expected[edge],5);
 await page.reload();expect(await stored(page)).toEqual(model);
});
