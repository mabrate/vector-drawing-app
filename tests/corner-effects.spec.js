import {test,expect} from '@playwright/test';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});
test('editable corners preserve lines, support undo and SVG reopen',async({page})=>{
 await page.goto('/');await page.locator('#units').selectOption('px',{force:true});page.once('dialog',dialog=>dialog.accept());
 await page.locator('#file').setInputFiles({name:'corner.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 200L200 200L200 300" fill="none" stroke="black"/></svg>')});
 await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');await page.locator('[data-tool=nodes]').click();await page.keyboard.press('Control+a');
 const data=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1]);
 await page.locator('#corner-amount').fill('20');await page.locator('#apply-corner').click();
 let d=await data();expect(d.segments[0]).toEqual([100,200]);expect(d.segments.at(-1)).toEqual([200,300]);expect(d.data.cornerEffect.map).toEqual([0,1,1,2]);expect(d.segments[1][0]).toEqual([180,200]);expect(d.segments[2][0]).toEqual([200,220]);
 await page.locator('#corner-amount').fill('30');await page.locator('#apply-corner').click();d=await data();expect(d.segments[1][0]).toEqual([170,200]);
 await page.locator('#canvas-undo').click();d=await data();expect(d.segments[1][0]).toEqual([180,200]);
 // Re-select after undo, export through the actual file workflow.
 await page.keyboard.press('Control+a');await page.locator('#save').click();await expect(page.locator('#download-svg')).toHaveText('Download SVG');
 const downloadEvent=page.waitForEvent('download');await page.locator('#download-svg').click();const download=await downloadEvent;const file=await download.path();await page.keyboard.press('Escape');
 page.once('dialog',dialog=>dialog.accept());await page.locator('#file').setInputFiles(file);await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');await page.locator('[data-tool=nodes]').click();await page.keyboard.press('Control+a');
 await expect(page.locator('#corner-amount')).toHaveValue('20');await page.locator('#corner-type').selectOption('chamfer');d=await data();expect(d.segments).toEqual([[100,200],[180,200],[200,220],[200,300]]);
 await page.locator('#reset-corner').click();expect((await data()).segments).toEqual([[100,200],[200,200],[200,300]]);
});

test('multiple transformed corners clamp without overlap and slider uses one undo step',async({page})=>{
 await page.goto('/');await page.locator('#units').selectOption('px',{force:true});page.once('dialog',d=>d.accept());
 await page.locator('#file').setInputFiles({name:'box.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path transform="translate(40 30) scale(2)" d="M100 100L200 100L200 200L100 200Z" fill="none" stroke="black"/></svg>')});await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');await page.locator('[data-tool=nodes]').click();await page.keyboard.press('Control+a');
 const data=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1]);
 await page.locator('#corner-amount').fill('1000');await page.locator('#apply-corner').click();let d=await data();expect(d.segments).toHaveLength(8);expect(Object.values(d.data.cornerEffect.effects).every(e=>e.amount>99.99&&e.amount<=100)).toBe(true);
 await page.locator('#corner-slider').evaluate(el=>{el.value='30';el.dispatchEvent(new Event('input'));el.value='40';el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));});
 expect(Object.values((await data()).data.cornerEffect.effects).every(e=>Math.abs(e.amount-40)<1e-8)).toBe(true);
 await page.locator('#canvas-undo').click();expect(Object.values((await data()).data.cornerEffect.effects).every(e=>e.amount>99.99&&e.amount<=100)).toBe(true);
 await page.reload();await page.keyboard.press('Control+a');await page.locator('[data-tool=nodes]').click();await page.keyboard.press('Control+a');await expect(page.locator('#apply-corner')).toBeEnabled();
 await page.locator('#corner-amount').fill('20');await page.locator('#apply-corner').click();await page.screenshot({path:'/tmp/vector-lab-corners.png'});
});

test('document-space radii survive transforms and unrelated curves keep their handles',async()=>{
 const {default:paper}=await import('paper');const {sourceFor,rebuildCorners,cornerModel}=await import('../src/corner-effects.js');paper.setup(new paper.Size(1056,816));
 for(const reverse of [false,true]){
  const path=new paper.Path({insert:false,segments:reverse?[[0,100],[100,100],[100,0],[200,0]]:[[0,0],[100,0],[100,100],[200,100]]});path.lastSegment.handleIn=[-20,10];path.applyMatrix=false;path.scale(2,3);path.rotate(25);path.translate([40,50]);
  const last=path.lastSegment.clone(),origin=path.localToGlobal(path.segments[1].point),model={version:1,source:sourceFor(path),closed:false,effects:{1:{type:'fillet',amount:20}}};
  rebuildCorners(paper,path,model);expect(path.localToGlobal(path.segments[1].point).getDistance(origin)).toBeCloseTo(20,6);expect(path.localToGlobal(path.segments[2].point).getDistance(origin)).toBeCloseTo(20,6);expect(path.lastSegment.point.equals(last.point)).toBe(true);expect(path.lastSegment.handleIn.equals(last.handleIn)).toBe(true);expect(cornerModel(path)).toBeTruthy();path.scale(2);expect(cornerModel(path).effects[1].amount).toBeCloseTo(40,6);
  path.firstSegment.point.x+=5;expect(cornerModel(path)).toBeNull();path.remove();
 }
});

test('maximum neighbouring treatments retain independent tangent nodes after path serialization',async()=>{
 const {default:paper}=await import('paper');const {sourceFor,rebuildCorners}=await import('../src/corner-effects.js');paper.setup(new paper.Size(500,500));
 for(const type of ['fillet','chamfer']){const path=new paper.Path({segments:[[0,0],[100,0],[100,100],[0,100]],closed:true,insert:false}),model={version:1,source:sourceFor(path),closed:true,effects:Object.fromEntries([0,1,2,3].map(i=>[i,{type,amount:1000}]))};rebuildCorners(paper,path,model);const reopened=new paper.Path({pathData:path.pathData,insert:false});expect(reopened.segments).toHaveLength(8);path.remove();reopened.remove();}
});

test('corner amounts follow page units without changing geometry on conversion',async({page})=>{
 await page.goto('/');page.once('dialog',d=>d.accept());
 await page.locator('#file').setInputFiles({name:'units.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><path d="M100 200L300 200L300 400" fill="none" stroke="black"/></svg>')});
 await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');await page.locator('[data-tool=nodes]').click();await page.keyboard.press('Control+a');
 const data=()=>page.evaluate(()=>localStorage.getItem('vector-lab'));
 await expect(page.locator('#corner-amount-label')).toHaveText('Radius (in)');await page.locator('#corner-amount').fill('0.25');await page.locator('#apply-corner').click();
 expect(JSON.parse(await data())[1].children[0][1].data.cornerEffect.effects[1].amount).toBeCloseTo(24,8);
 const before=await data();
 for(const [unit,value] of [['mm',6.35],['px',24],['pt',18],['in',0.25]]){
  await page.locator('#units').selectOption(unit,{force:true});await expect(page.locator('#corner-amount-label')).toHaveText(`Radius (${unit})`);expect(Number(await page.locator('#corner-amount').inputValue())).toBeCloseTo(value,6);expect(await data()).toBe(before);
 }
 await page.locator('#corner-type').selectOption('chamfer');await expect(page.locator('#corner-amount-label')).toHaveText('Distance (in)');
 await page.locator('#corner-slider').evaluate(el=>{el.value='0.5';el.dispatchEvent(new Event('input'));el.dispatchEvent(new Event('change'));});expect(JSON.parse(await data())[1].children[0][1].data.cornerEffect.effects[1].amount).toBeCloseTo(48,8);
});
