import {test,expect} from '@playwright/test';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});
async function points(page,count){const r=await page.locator('#canvas').boundingBox();for(let i=0;i<count;i++)await page.mouse.click(r.x+120+i*90,r.y+150+(i%2)*80);}
async function drawing(page){return page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children||[]);}
test('pen undo removes one node at a time and allows drawing to continue',async({page})=>{
 await page.goto('/');await page.locator('[data-tool=pen]').click();await points(page,3);
 await expect(page.locator('#undo')).toBeEnabled();
 await page.keyboard.press('Control+z');let items=await drawing(page);expect(items).toHaveLength(1);expect(items[0][1].segments).toHaveLength(2);
 await expect(page.locator('#finish')).toBeVisible();
 await page.keyboard.press('Meta+z');items=await drawing(page);expect(items[0][1].segments).toHaveLength(1);
 await page.keyboard.press('Control+z');expect(await drawing(page)).toHaveLength(0);await expect(page.locator('#finish')).toBeHidden();
 await points(page,3);await page.keyboard.press('Enter');expect((await drawing(page))[0][1].segments).toHaveLength(3);
 await page.keyboard.press('Control+z');expect(await drawing(page)).toHaveLength(0);
});
test('Escape cancels pen drawing and clears object and node selection',async({page})=>{
 await page.goto('/');await page.locator('[data-tool=pen]').click();await points(page,3);await page.keyboard.press('Escape');
 expect(await drawing(page)).toHaveLength(0);await expect(page.locator('#finish')).toBeHidden();await expect(page.locator('#delete')).toBeDisabled();
 await points(page,3);await page.keyboard.press('Enter');await page.keyboard.press('Escape');expect(await drawing(page)).toHaveLength(1);await expect(page.locator('#delete')).toBeDisabled();
 await page.keyboard.press('n');await page.keyboard.press('Control+a');await expect(page.locator('#node-count')).toContainText('3 nodes');await page.keyboard.press('Escape');await expect(page.locator('#node-count')).toHaveText('0 nodes selected');await expect(page.locator('#delete')).toBeDisabled();
});
for(const modifier of ['Control','Meta'])test(`${modifier} snaps pen segments and curve handles to 15 degrees`,async({page})=>{
 await page.goto('/');await page.locator('[data-tool=pen]').click();
 await page.locator('#snapping').evaluate(el=>{el.checked=false;});
 const r=await page.locator('#canvas').boundingBox();
 const read=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1].segments);
 const xy=s=>typeof s[0]==='number'?s:s[0];
 const angle=v=>Math.atan2(v[1],v[0])*180/Math.PI;
 await page.mouse.click(r.x+120,r.y+150);
 await page.keyboard.down(modifier);await page.mouse.click(r.x+240,r.y+200);await page.keyboard.up(modifier);
 await page.mouse.move(r.x+360,r.y+250);await page.mouse.down();await page.mouse.move(r.x+440,r.y+280);
 await page.keyboard.down(modifier);await page.mouse.up();await page.keyboard.up(modifier);await page.keyboard.press('Enter');
 const segments=await read(),a=xy(segments[0]),b=xy(segments[1]),c=xy(segments[2]);
 expect(angle([b[0]-a[0],b[1]-a[1]])).toBeCloseTo(30,5);
 expect(angle(segments[2][2])).toBeCloseTo(15,5);
 expect(angle([c[0]-b[0],c[1]-b[1]])/15).not.toBeCloseTo(Math.round(angle([c[0]-b[0],c[1]-b[1]])/15),2);
 expect(Math.hypot(...segments[2][2])).toBeCloseTo(Math.hypot(80,30)*Math.hypot(b[0]-a[0],b[1]-a[1])/130,4);
});
test('pen preview follows the pointer, snaps live and stays out of saved artwork',async({page})=>{
 await page.goto('/');await page.locator('[data-tool=pen]').click();
 await page.locator('#snapping').evaluate(el=>{el.checked=false;});
 const r=await page.locator('#canvas').boundingBox();
 const preview=()=>page.evaluate(async()=>{await new Promise(requestAnimationFrame);const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name);const p=paper.project.getItem({name:'pen-preview'});return p?{points:p.segments.map(s=>[s.point.x,s.point.y]),handles:p.segments.map(s=>[s.handleIn.length,s.handleOut.length])}:null;});
 const angle=p=>Math.atan2(p.points[1][1]-p.points[0][1],p.points[1][0]-p.points[0][0])*180/Math.PI;
 await page.mouse.click(r.x+120,r.y+150);await page.mouse.move(r.x+240,r.y+200);
 expect(angle(await preview())).toBeCloseTo(Math.atan2(50,120)*180/Math.PI,4);
 await page.keyboard.down('Control');expect(angle(await preview())).toBeCloseTo(30,4);
 await page.keyboard.up('Control');expect(angle(await preview())).toBeCloseTo(Math.atan2(50,120)*180/Math.PI,4);
 await page.mouse.down();await page.mouse.move(r.x+280,r.y+220);expect(await preview()).toBeNull();await page.mouse.up();
 await page.mouse.move(r.x+360,r.y+280);expect((await preview()).handles[0][1]).toBeGreaterThan(0);
 await page.mouse.move(0,0);expect(await preview()).toBeNull();
 await page.mouse.move(r.x+360,r.y+280);expect(await preview()).not.toBeNull();
 await page.keyboard.press('Enter');expect(await preview()).toBeNull();
 const items=await drawing(page);expect(items).toHaveLength(1);expect(items[0][1].segments).toHaveLength(2);expect(JSON.stringify(items)).not.toContain('pen-preview');
});
test('Ctrl pen angle snapping retains compatible node alignment guides',async({page})=>{
 await page.goto('/');await page.locator('[data-tool=pen]').click();
 const r=await page.locator('#canvas').boundingBox();
 await page.mouse.click(r.x+120,r.y+150);await page.mouse.move(r.x+240,r.y+153);
 const state=()=>page.evaluate(async()=>{await new Promise(requestAnimationFrame);const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name);const preview=paper.project.getItem({name:'pen-preview'});return {points:preview.segments.map(s=>[s.point.x,s.point.y]),guides:paper.project.activeLayer.project.layers.at(-1).children.filter(p=>p.strokeColor?.toCSS(true)==='#dd658c').length};});
 const before=await state();expect(before.guides).toBeGreaterThan(0);
 await page.keyboard.down('Control');const after=await state();expect(after.guides).toBeGreaterThan(0);expect(after.points[1][1]).toBeCloseTo(after.points[0][1],6);
 await page.mouse.click(r.x+240,r.y+153);await page.keyboard.up('Control');await page.keyboard.press('Enter');
 const segments=(await drawing(page))[0][1].segments;expect(segments[1][1]).toBeCloseTo(segments[0][1],6);
});
test('pen hover batches pointer events without rebuilding selection controls',async({page})=>{
 await page.goto('/');await page.locator('[data-tool=pen]').click();
 const r=await page.locator('#canvas').boundingBox();await page.mouse.click(r.x+120,r.y+150);
 const result=await page.evaluate(async()=>{
  await new Promise(requestAnimationFrame);
  const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name);
  const layer=paper.project.layers.find(l=>l.name==='pen-overlay'),selection=paper.project.layers[2],children=[...selection.children];
  let renders=0;const remove=layer.removeChildren;layer.removeChildren=function(...args){renders++;return remove.apply(this,args);};
  const canvas=document.querySelector('#canvas'),r=canvas.getBoundingClientRect();
  for(let i=0;i<30;i++)canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId:999,pointerType:'mouse',clientX:r.x+180+i,clientY:r.y+220,bubbles:true}));
  const immediate=renders;await new Promise(requestAnimationFrame);
  const preview=paper.project.getItem({name:'pen-preview'}),end=paper.view.projectToView(preview.lastSegment.point);
  const stable=children.every((item,index)=>selection.children[index]===item);
  layer.removeChildren=remove;
  // Finishing before a queued frame must not resurrect the preview.
  canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId:999,pointerType:'mouse',clientX:r.x+300,clientY:r.y+250,bubbles:true}));
  canvas.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
  await new Promise(requestAnimationFrame);
  return {immediate,renders,stable,end:[end.x,end.y],previewAfterFinish:!!paper.project.getItem({name:'pen-preview'})};
 });
 expect(result.immediate).toBe(0);expect(result.renders).toBe(1);expect(result.stable).toBe(true);expect(result.end[0]).toBeCloseTo(209,4);expect(result.previewAfterFinish).toBe(false);
});
