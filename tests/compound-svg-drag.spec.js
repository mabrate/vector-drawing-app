import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test.use({viewport:{width:1024,height:768},hasTouch:true,launchOptions:{executablePath:'/usr/bin/google-chrome'}});
const fixture=new URL('./fixtures/transformed-compound.svg',import.meta.url);
// Paper's JSON round trip can change the last few floating-point digits.
const drawingJSON=text=>JSON.parse(text,(_,value)=>typeof value==='number'?Number(value.toFixed(8)):value);
async function noSnapping(page){await page.locator('#file-menu-button').click();await page.locator('#settings').click();await page.locator('#snapping').uncheck();await page.locator('#settings-done').click();}
async function setup(page,mode='insert'){
 await page.goto('/');await noSnapping(page);
 if(mode==='open')page.once('dialog',d=>d.accept());
 await page.locator(mode==='open'?'#file':'#image-file').setInputFiles({name:'vector-lab.svg',mimeType:'image/svg+xml',buffer:await readFile(fixture)});
 await expect(page.locator('#status')).toContainText(mode==='open'?'SVG opened':'Inserted');
}
async function bounds(page){return page.evaluate(async()=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name);return paper.project.layers[1].children.map(i=>[i.bounds.x,i.bounds.y,i.bounds.width,i.bounds.height]);});}
async function grip(page){return page.locator('#canvas').evaluate(async c=>{
 const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),b=paper.project.layers[1].firstChild.bounds,r=c.getBoundingClientRect(),p=new paper.Point(b.x+69,b.y+27),a=paper.view.projectToView(p),z=paper.view.zoom;
 return {a:{x:r.x+a.x,y:r.y+a.y},b:{x:r.x+a.x+35*z,y:r.y+a.y+20*z}};
});}
async function drag(page,input){const {a,b}=await grip(page);if(input==='mouse'){await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:5});await page.mouse.up();}else{const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...a}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,...b}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}}

for(const mode of ['insert','open'])for(const input of ['mouse','touch'])test(`${mode}: supplied SVG can be dragged from its visible compound outline with ${input}`,async({page})=>{
 await setup(page,mode);const before=await bounds(page),saved=await page.evaluate(()=>localStorage.getItem('vector-lab'));
 await drag(page,input);const after=await bounds(page);
 expect(after[0][0]-before[0][0]).toBeCloseTo(35,4);expect(after[0][1]-before[0][1]).toBeCloseTo(20,4);expect(after[0][2]).toBeCloseTo(before[0][2],4);expect(after[0][3]).toBeCloseTo(before[0][3],4);
 await page.locator('#canvas-undo').click();expect(drawingJSON(await page.evaluate(()=>localStorage.getItem('vector-lab')))).toEqual(drawingJSON(saved));
 await page.locator('#canvas-redo').click();const redone=await bounds(page);for(let i=0;i<after.length;i++)for(let j=0;j<4;j++)expect(redone[i][j]).toBeCloseTo(after[i][j],7);
 await page.reload();await noSnapping(page);const recovered=await bounds(page);await drag(page,input);const moved=await bounds(page);expect(moved[0][0]-recovered[0][0]).toBeCloseTo(35,4);expect(moved[0][1]-recovered[0][1]).toBeCloseTo(20,4);
});

test('compound fill hit detection follows the supplied SVG outline and preserves its holes',async({page})=>{
 await setup(page);
 const result=await page.evaluate(async()=>{const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),art=paper.project.layers[1],root=art.firstChild,b=root.bounds,compound=root.firstChild;
  return {outline:art.hitTest(new paper.Point(b.x+69,b.y+27),{fill:true,stroke:true,tolerance:0})?.item.className,hole:!!art.hitTest(new paper.Point(b.x+80,b.y+120),{fill:true,stroke:true,tolerance:0}),subpaths:compound.children.length};
 });
 expect(result.outline).toBe('CompoundPath');expect(result.hole).toBe(false);expect(result.subpaths).toBe(5);
});

test('selected SVG export can be reopened and dragged by the visible outline',async({page})=>{
 await setup(page);await drag(page,'mouse');
 await page.locator('#save').click();await page.locator('#export-selected').check();await expect(page.locator('#export-status')).toHaveText('Ready to save or share.');const waiting=page.waitForEvent('download');await page.locator('#download-svg').click();const file=await waiting;
 page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles(await file.path());await expect(page.locator('#status')).toContainText('SVG opened');
 const before=await bounds(page);await drag(page,'touch');const after=await bounds(page);expect(after[0][0]-before[0][0]).toBeCloseTo(35,4);expect(after[0][1]-before[0][1]).toBeCloseTo(20,4);
});

test('browser recovery repairs compound subpaths saved by the earlier importer',async({page})=>{
 await setup(page);const before=await bounds(page);
 await page.evaluate(async()=>{
  const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name),art=paper.project.layers[1],compound=art.firstChild.firstChild,matrix=new paper.Matrix().translate(-487.977,-334.451),inverse=matrix.inverted();
  // Recreate the earlier importer's retained matrices without changing appearance.
  for(const child of compound.children){child.applyMatrix=false;child.segments.forEach(s=>s.transform(inverse));child.matrix=matrix.clone();}
  localStorage.setItem('vector-lab',art.exportJSON({asString:true,precision:15}));
 });
 await page.reload();await noSnapping(page);const recovered=await bounds(page);for(let i=0;i<4;i++)expect(recovered[0][i]).toBeCloseTo(before[0][i],7);
 await drag(page,'touch');const after=await bounds(page);expect(after[0][0]-recovered[0][0]).toBeCloseTo(35,4);expect(after[0][1]-recovered[0][1]).toBeCloseTo(20,4);
});

test('compound normalization preserves transformed editable corners and is idempotent',async()=>{
 const {default:paper}=await import('paper'),{normalizeCompoundPaths}=await import('../src/compound-paths.js'),{sourceFor,rebuildCorners,cornerModel}=await import('../src/corner-effects.js');paper.setup(new paper.Size(500,500));
 const path=new paper.Path({segments:[[0,0],[100,0],[100,100],[0,100]],closed:true,applyMatrix:false,insert:false}),compound=new paper.CompoundPath({children:[path],fillColor:'pink',applyMatrix:false,insert:false}),source=sourceFor(path),model={version:1,source,closed:true,effects:{1:{type:'fillet',amount:10}}};
 rebuildCorners(paper,path,model);path.transform(new paper.Matrix().translate(120,70).rotate(23).scale(2));
 const points=path.segments.map(s=>path.localToGlobal(s.point)),sharp=source.map(s=>path.localToGlobal(new paper.Point(s[0]))),amount=cornerModel(path).effects[1].amount;
 normalizeCompoundPaths(compound);expect(path.matrix.isIdentity()).toBe(true);expect(path.segments).toHaveLength(points.length);path.segments.forEach((s,i)=>expect(path.localToGlobal(s.point).getDistance(points[i])).toBeLessThan(1e-8));expect(cornerModel(path).effects[1].amount).toBeCloseTo(amount,7);
 const saved=compound.exportJSON({asString:true});normalizeCompoundPaths(compound);expect(compound.exportJSON({asString:true})).toBe(saved);
 cornerModel(path).effects[1].amount=0;rebuildCorners(paper,path,cornerModel(path));expect(path.segments).toHaveLength(4);path.segments.forEach((s,i)=>expect(path.localToGlobal(s.point).getDistance(sharp[i])).toBeLessThan(1e-8));compound.remove();
});
