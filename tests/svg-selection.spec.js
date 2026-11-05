import {test,expect} from '@playwright/test';

test.use({viewport:{width:1024,height:768},hasTouch:true,launchOptions:{executablePath:'/usr/bin/google-chrome'}});
const drawing='<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816"><path d="M200 250h140v140H200z" fill="red"/><path d="M450 250h140v140H450z" fill="blue"/><path d="M750 500h100v100H750z" fill="orange"/></svg>';
const svgFile=(name,svg=drawing,mimeType='image/svg+xml')=>({name,mimeType,buffer:Buffer.from(svg)});
async function open(page,svg=drawing){page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles(svgFile('drawing.svg',svg));await expect(page.locator('#status')).toContainText('SVG opened');}
async function point(page,x,y){return page.locator('#canvas').evaluate(async(c,{x,y})=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),p=paper.view.projectToView(new paper.Point(x,y)),r=c.getBoundingClientRect();return{x:r.x+p.x,y:r.y+p.y};},{x,y});}
async function state(page){return page.evaluate(async()=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name);return paper.project.layers[1].children.map(i=>({type:i.className,bounds:[i.bounds.x,i.bounds.y,i.bounds.width,i.bounds.height],paths:i instanceof paper.Path?1:i.getItems({class:paper.Path}).length}));});}
async function touchDrag(page,from,to){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...await point(page,...from)}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,...await point(page,...to)}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
test.beforeEach(async({page})=>{await page.goto('/');await page.locator('#file-menu-button').click();await page.locator('#settings').click();await page.locator('#snapping').uncheck();await page.locator('#settings-done').click();});

test('Insert image accepts multiple editable SVGs without replacing the drawing or page',async({page})=>{
 await open(page);const before=await state(page),saved=await page.evaluate(()=>localStorage.getItem('vector-lab'));
 await expect(page.locator('#image-file')).toHaveAttribute('accept',/\.svg/);
 const artwork='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><path d="M0 0h1200v800H0z" fill="purple"/><circle cx="600" cy="400" r="100" fill="white"/></svg>';
 await page.locator('#image-file').setInputFiles([svgFile('one.svg',artwork),svgFile('two.SVG',artwork,'')]);
 await expect(page.locator('#status')).toContainText('Inserted');const imported=await state(page);expect(imported.slice(0,3)).toEqual(before);expect(imported).toHaveLength(5);
 for(const item of imported.slice(3)){expect(item.type).toBe('Group');expect(item.paths).toBe(2);expect(item.bounds[2]).toBeCloseTo(739.2,4);expect(item.bounds[3]).toBeCloseTo(492.8,4);}
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].data.page)).toEqual({width:1056,height:816});
 await page.locator('#canvas-undo').click();expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(saved);
 await page.locator('#canvas-redo').click();expect(await state(page)).toEqual(imported);await page.reload();expect(await state(page)).toEqual(imported);
});

test('opening SVG returns to Select and touch dragging moves the opened artwork',async({page})=>{
 await page.locator('[data-tool=nodes]').click();await open(page);await expect(page.locator('[data-tool=select]')).toHaveClass(/active/);
 const before=await state(page);await touchDrag(page,[270,320],[320,360]);const after=await state(page);expect(after[0].bounds[0]-before[0].bounds[0]).toBeCloseTo(50,3);expect(after[0].bounds[1]-before[0].bounds[1]).toBeCloseTo(40,3);
});

test('small opened SVG can be touch-dragged after selecting it, without resize handles stealing the drag',async({page})=>{
 await open(page,'<svg xmlns="http://www.w3.org/2000/svg" width="1056" height="816"><path d="M400 300h24v24H400z" fill="red"/></svg>');
 const p=await point(page,412,312);await page.touchscreen.tap(p.x,p.y);const before=await state(page);
 await touchDrag(page,[412,312],[462,352]);const after=await state(page);
 expect(after[0].bounds[0]-before[0].bounds[0]).toBeCloseTo(50,3);expect(after[0].bounds[1]-before[0].bounds[1]).toBeCloseTo(40,3);expect(after[0].bounds.slice(2)).toEqual(before[0].bounds.slice(2));
});

for(const reverse of [false,true])test(`touch object marquee persists after release and moves all enclosed shapes (${reverse?'reverse':'forward'})`,async({page})=>{
 await open(page);const before=await state(page),a=[150,200],b=[640,440];await touchDrag(page,reverse?b:a,reverse?a:b);
 await expect(page.locator('#group-objects')).toBeVisible();await touchDrag(page,[270,320],[310,350]);const after=await state(page);
 for(const i of [0,1]){expect(after[i].bounds[0]-before[i].bounds[0]).toBeCloseTo(40,3);expect(after[i].bounds[1]-before[i].bounds[1]).toBeCloseTo(30,3);}expect(after[2]).toEqual(before[2]);
});

test('Nodes marquee selects only anchors on the selected paths and keeps them after release',async({page})=>{
 await open(page);await touchDrag(page,[150,200],[640,440]);await page.locator('[data-tool=nodes]').click();await touchDrag(page,[150,200],[900,650]);await expect(page.locator('#node-count')).toHaveText('8 nodes selected');
 const before=await state(page);await touchDrag(page,[200,250],[240,280]);const after=await state(page);for(const i of [0,1]){expect(after[i].bounds[0]-before[i].bounds[0]).toBeCloseTo(40,3);expect(after[i].bounds[1]-before[i].bounds[1]).toBeCloseTo(30,3);}expect(after[2]).toEqual(before[2]);
});

test('box selection uses release position even when no final move event arrives',async({page})=>{
 await open(page);const a=await point(page,150,200),b=await point(page,640,440);
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.locator('#canvas').dispatchEvent('pointerup',{pointerId:1,pointerType:'mouse',button:0,buttons:0,clientX:b.x,clientY:b.y});await page.mouse.up();
 await expect(page.locator('#group-objects')).toBeVisible();
});

test('captured touch coordinates do not depend on event offsets',async({page})=>{
 await open(page);const before=await state(page),cdp=await page.context().newCDPSession(page),a=await point(page,270,320),b=await point(page,320,360);
 await page.locator('#canvas').evaluate(c=>{for(const type of ['pointerdown','pointermove','pointerup'])c.addEventListener(type,e=>{Object.defineProperties(e,{offsetX:{value:0},offsetY:{value:0}});},{capture:true});});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...a}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,...b}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 const after=await state(page);expect(after[0].bounds[0]-before[0].bounds[0]).toBeCloseTo(50,3);expect(after[0].bounds[1]-before[0].bounds[1]).toBeCloseTo(40,3);
});

test('inserted SVG group moves by touch and remains editable through save, reopen, and ungroup',async({page})=>{
 await page.locator('#image-file').setInputFiles(svgFile('art.svg','<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="red"/><circle cx="100" cy="100" r="30" fill="blue"/></svg>'));
 await expect(page.locator('#status')).toContainText('Inserted');const before=await state(page);await touchDrag(page,[528,408],[568,438]);const moved=await state(page);expect(moved[0].bounds[0]-before[0].bounds[0]).toBeCloseTo(40,3);expect(moved[0].bounds[1]-before[0].bounds[1]).toBeCloseTo(30,3);
 await page.locator('#save').click();const download=page.waitForEvent('download');await page.locator('#download-svg').click();const file=await download,bytes=Buffer.concat(await(await file.createReadStream()).toArray()).toString();expect(bytes).not.toContain('<image');
 await open(page,bytes);const reopened=await state(page);expect(reopened[0].type).toBe('Group');expect(reopened[0].paths).toBe(2);for(let i=0;i<4;i++)expect(reopened[0].bounds[i]).toBeCloseTo(moved[0].bounds[i],6);
 await page.keyboard.press('Control+a');await page.locator('#ungroup-objects').click();expect(await state(page)).toHaveLength(2);await page.locator('[data-tool=nodes]').click();await page.keyboard.press('Control+a');await expect(page.locator('#node-count')).toHaveText('8 nodes selected');
});

test('SVG insertion keeps original dimensions on request and rejects active content without replacing artwork',async({page})=>{
 await open(page);const before=await state(page);await page.locator('#image-import-size-toggle').click();const choosing=page.waitForEvent('filechooser');await page.locator('#import-image-original').click();await(await choosing).setFiles(svgFile('large.svg','<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="purple"/></svg>'));
 await expect(page.locator('#status')).toContainText('Inserted');const imported=await state(page);expect(imported.slice(0,3)).toEqual(before);expect(imported[3].bounds.slice(2)).toEqual([1200,800]);
 const saved=await page.evaluate(()=>localStorage.getItem('vector-lab'));await page.locator('#image-file').setInputFiles(svgFile('unsafe.svg','<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
 await expect(page.locator('#status')).toContainText('no external links or code');expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(saved);
});

test('cancelled node marquee restores the previous node selection and paths',async({page})=>{
 await open(page);await page.keyboard.press('Control+a');await page.locator('[data-tool=nodes]').click();await touchDrag(page,[150,200],[380,440]);await expect(page.locator('#node-count')).toHaveText('4 nodes selected');await page.locator('#multi').check();
 const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...await point(page,410,200)}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,...await point(page,640,440)}]});await expect(page.locator('#node-count')).toHaveText('8 nodes selected');await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await expect(page.locator('#node-count')).toHaveText('4 nodes selected');
 const before=await state(page);await page.keyboard.press('ArrowRight');const after=await state(page);expect(after[0].bounds[0]).toBeGreaterThan(before[0].bounds[0]);expect(after.slice(1)).toEqual(before.slice(1));
});


test('Nodes marquee leaves unselected paths unselected when no paths are selected',async({page})=>{
 await open(page);await page.locator('[data-tool=nodes]').click();await touchDrag(page,[150,200],[900,650]);await expect(page.locator('#node-count')).toHaveText('0 nodes selected');
});

for(const tool of ['select','nodes'])for(const releaseCoordinates of ['start','zero'])test(`${tool} keeps the highlighted box selection when touch release coordinates report ${releaseCoordinates}`,async({page})=>{
 await open(page);
 if(tool==='nodes'){await touchDrag(page,[150,200],[640,440]);await page.locator('[data-tool=nodes]').click();}
 const cdp=await page.context().newCDPSession(page),a=await point(page,150,200),b=await point(page,640,440);
 await page.locator('#canvas').evaluate((c,release)=>{
  c.addEventListener('pointerup',e=>{if(e.pointerType==='touch')Object.defineProperties(e,{clientX:{value:release.x},clientY:{value:release.y},offsetX:{value:0},offsetY:{value:0}});},{capture:true,once:true});
 },releaseCoordinates==='start'?a:{x:0,y:0});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...a}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,...b}]});
 if(tool==='nodes')await expect(page.locator('#node-count')).toHaveText('8 nodes selected');else await expect(page.locator('#group-objects')).toBeVisible();
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 if(tool==='nodes')await expect(page.locator('#node-count')).toHaveText('8 nodes selected');else await expect(page.locator('#group-objects')).toBeVisible();
 const before=await state(page);await touchDrag(page,tool==='nodes'?[200,250]:[270,320],tool==='nodes'?[240,280]:[310,350]);const after=await state(page);
 for(const i of [0,1]){expect(after[i].bounds[0]-before[i].bounds[0]).toBeCloseTo(40,3);expect(after[i].bounds[1]-before[i].bounds[1]).toBeCloseTo(30,3);}expect(after[2]).toEqual(before[2]);
});
