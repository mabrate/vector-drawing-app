import {test,expect} from '@playwright/test';
import paper from 'paper';
import {sourceFor,rebuildCorners,cornerModel,eligible} from '../src/corner-effects.js';
import {solveCurvedFillet} from '../src/curved-fillets.js';
test.beforeEach(()=>paper.setup(new paper.Size(1056,816)));
const fixtures=[
 'M0 100C30 100 70 80 100 100L100 200',
 'M0 100L100 100C120 130 80 170 100 200',
 'M0 100C30 100 70 80 100 100C120 130 80 170 100 200',
 'M0 100C30 100 70 120 100 100C120 70 80 30 100 0',
 'M0 100C20 140 60 140 100 100C60 60 60 20 100 0',
 'M0 100C30 100 70 80 100 100C60 100 40 150 100 200',
];
for(const [index,d] of fixtures.entries())test(`curved fillet ${index+1} preserves the exact remaining curves and has tangent circular joins`,()=>{
 const source=new paper.Path({pathData:d,insert:false}),path=source.clone({insert:false});
 path.applyMatrix=false;path.scale(1.4,.9);path.rotate(21);path.translate([30,40]);source.applyMatrix=false;source.matrix=path.matrix.clone();source.applyMatrix=true;
 const solution=solveCurvedFillet(paper,source.curves[0],source.curves[1],15);expect(solution).toBeTruthy();
 const model={version:1,source:sourceFor(path),closed:false,effects:{1:{type:'fillet',amount:15}}};rebuildCorners(paper,path,model);
 const world=path.clone({insert:false});world.applyMatrix=true;
 const a=source.curves[0].getPart(0,solution.t),b=source.curves[1].getPart(solution.u,1);
 for(let i=0;i<=20;i++){const t=i/20;expect(world.firstCurve.getPointAtTime(t).getDistance(a.getPointAtTime(t))).toBeLessThan(1e-7);expect(world.lastCurve.getPointAtTime(t).getDistance(b.getPointAtTime(t))).toBeLessThan(1e-7);}
 for(let i=1;i<world.curves.length;i++)expect(world.curves[i-1].getTangentAtTime(1).dot(world.curves[i].getTangentAtTime(0))).toBeGreaterThan(.999999);
 for(const arc of world.curves.slice(1,-1))for(let i=0;i<=20;i++)expect(Math.abs(arc.getPointAtTime(i/20).getDistance(solution.centre)-15)).toBeLessThan(.005);
 const original=JSON.stringify(model.source);model.effects[1].amount=8;rebuildCorners(paper,path,model);expect(JSON.stringify(model.source)).toBe(original);
 expect(cornerModel(path)).toBeTruthy();path.scale(2);expect(cornerModel(path).effects[1].amount).toBeCloseTo(16,5);
 model.effects[1].amount=0;rebuildCorners(paper,path,model);expect(sourceFor(path)).toEqual(model.source);
});

test('smooth nodes and curved chamfers remain excluded; impossible curved radii preserve the original',()=>{
 const smooth=new paper.Path({pathData:'M0 0C30 0 70 0 100 0C130 0 170 10 200 0',insert:false});expect(eligible(sourceFor(smooth),1,false)).toBe(false);
 const path=new paper.Path({pathData:fixtures[2],insert:false}),before=path.pathData,model={version:1,source:sourceFor(path),closed:false,effects:{1:{type:'fillet',amount:10000}}};
 expect(eligible(model.source,1,false,'chamfer')).toBe(false);expect(()=>rebuildCorners(paper,path,model)).toThrow('does not fit');expect(path.pathData).toBe(before);expect(path.data.cornerEffect).toBeUndefined();
});

test('neighbouring curved fillets preserve the shared Bézier with exact subdivision',()=>{
 const source=new paper.Path({pathData:'M0 100C30 100 70 80 100 100C120 130 80 170 100 200C70 220 30 180 0 200',insert:false}),path=source.clone({insert:false});
 const a=solveCurvedFillet(paper,source.curves[0],source.curves[1],8),b=solveCurvedFillet(paper,source.curves[1],source.curves[2],8);expect(a).toBeTruthy();expect(b).toBeTruthy();
 const model={version:1,source:sourceFor(path),closed:false,effects:{1:{type:'fillet',amount:8},2:{type:'fillet',amount:8}}};rebuildCorners(paper,path,model);
 const shared=path.curves[model.map.lastIndexOf(1)],expected=source.curves[1].getPart(a.u,b.t);
 for(let i=0;i<=20;i++)expect(shared.getPointAtTime(i/20).getDistance(expected.getPointAtTime(i/20))).toBeLessThan(1e-7);
});

async function openCurve(page,d=fixtures[2]){
 await page.goto('/');await page.locator('#units').selectOption('px',{force:true});page.once('dialog',dialog=>dialog.accept());
 await page.locator('#file').setInputFiles({name:'curved-corner.svg',mimeType:'image/svg+xml',buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><path transform="translate(250 100) scale(3)" d="${d}" fill="none" stroke="black"/></svg>`)});
 await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');await page.locator('[data-tool=nodes]').click();await page.keyboard.press('Control+a');
}
const data=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('vector-lab'))[1].children[0][1]);
test('curved fillets remain editable after SVG download, undo and recovery',async({page})=>{
 await openCurve(page);const before=await data(page);await expect(page.locator('#apply-corner')).toBeEnabled();
 await page.locator('#corner-amount').fill('15');await page.locator('#apply-corner').click();expect((await data(page)).segments).toHaveLength(4);
 const downloadEvent=page.waitForEvent('download');await page.locator('#save').click();await page.locator('#download-svg').click();const download=await downloadEvent;page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles(await download.path());await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');await page.locator('[data-tool=nodes]').click();await page.keyboard.press('Control+a');await expect(page.locator('#corner-amount')).toHaveValue('15');
 await page.locator('#corner-amount').fill('8');await page.locator('#apply-corner').click();expect((await data(page)).data.cornerEffect.effects[1].amount).toBeCloseTo(8,5);
 await page.locator('#canvas-undo').click();expect((await data(page)).data.cornerEffect.effects[1].amount).toBeCloseTo(15,5);await page.reload();await page.keyboard.press('Control+a');await page.locator('[data-tool=nodes]').click();await page.keyboard.press('Control+a');
 await page.locator('#reset-corner').click();expect((await data(page)).segments).toEqual(before.segments);
});

test('an impossible radius leaves browser recovery and corner selection intact',async({page})=>{
 await openCurve(page);const before=await data(page);await page.locator('#corner-amount').fill('10000');await page.locator('#apply-corner').click();await expect(page.locator('#status')).toContainText('does not fit');expect(await data(page)).toEqual(before);
 await page.locator('#corner-amount').fill('15');await page.locator('#apply-corner').click();expect((await data(page)).data.cornerEffect.effects[1].amount).toBe(15);
 const valid=await data(page);await page.locator('#corner-amount').fill('10000');await page.locator('#apply-corner').click();await expect(page.locator('#status')).toContainText('does not fit');expect(await data(page)).toEqual(valid);
});


test('a failed corner in a multiple-path selection leaves every path unchanged',async({page})=>{
 await page.goto('/');await page.locator('#units').selectOption('px',{force:true});page.once('dialog',d=>d.accept());
 await page.locator('#file').setInputFiles({name:'two-corners.svg',mimeType:'image/svg+xml',buffer:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><path d="M200 100L300 100L300 200" fill="none" stroke="black"/><path d="${fixtures[2]}" fill="none" stroke="black"/></svg>`)});
 await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');await page.locator('[data-tool=nodes]').click();await page.keyboard.press('Control+a');
 const before=await page.evaluate(()=>localStorage.getItem('vector-lab'));await page.locator('#corner-amount').fill('10000');await page.locator('#apply-corner').click();await expect(page.locator('#status')).toContainText('does not fit');expect(await page.evaluate(()=>localStorage.getItem('vector-lab'))).toBe(before);
});


test('a fillet split into multiple arc segments stays one editable corner after SVG reopening',async({page})=>{
 await openCurve(page,fixtures[5]);await page.locator('#corner-amount').fill('35');await page.locator('#apply-corner').click();expect((await data(page)).segments).toHaveLength(5);await page.screenshot({path:'/tmp/vector-lab-curved-fillets.png'});
 const waiting=page.waitForEvent('download');await page.locator('#save').click();await page.locator('#download-svg').click();const download=await waiting;page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles(await download.path());await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');await page.locator('[data-tool=nodes]').click();await page.keyboard.press('Control+a');await expect(page.locator('#corner-amount')).toHaveValue('35');
 await page.locator('#corner-amount').fill('20');await page.locator('#apply-corner').click();expect((await data(page)).data.cornerEffect.effects[1].amount).toBe(20);
});

test('a curved fillet at the first node of a closed path preserves the closing curve',()=>{
 const source=new paper.Path({pathData:'M100 100C120 130 80 170 100 200L0 200C20 150 60 80 100 100Z',insert:false}),path=source.clone({insert:false});
 const solution=solveCurvedFillet(paper,source.lastCurve,source.firstCurve,15);expect(solution).toBeTruthy();
 const model={version:1,source:sourceFor(path),closed:true,effects:{0:{type:'fillet',amount:15}}};rebuildCorners(paper,path,model);expect(path.closed).toBe(true);
 const closing=source.lastCurve.getPart(0,solution.t),opening=source.firstCurve.getPart(solution.u,1);
 for(let i=0;i<=20;i++){const t=i/20;expect(path.lastCurve.getPointAtTime(t).getDistance(closing.getPointAtTime(t))).toBeLessThan(1e-7);expect(path.curves[model.map.lastIndexOf(0)].getPointAtTime(t).getDistance(opening.getPointAtTime(t))).toBeLessThan(1e-7);}
 model.effects[0].amount=0;rebuildCorners(paper,path,model);expect(path.pathData).toBe(source.pathData);
});
