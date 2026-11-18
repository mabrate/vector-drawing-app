import {test,expect} from '@playwright/test';
import initOpenCascade from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {sealMesh,sealGrid,sealMinimumDiameter,sealError} from '../src/model3d-seal.js';
import {validModel,readModel} from '../src/model3d-data.js';
import {meshComponents} from '../src/model3d-stl.js';
import {buildModel,disposeBodies,exportModel} from '../src/model3d-kernel.js';
import {assertPrintableSTL} from '../src/model3d-chamfer.js';
import {draftSealHeights} from '../src/model3d-seal-draft.js';
import {open,idle,choose,preview,stored,snapshot,editLast} from './model3d-helpers.js';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome',args:['--enable-unsafe-swiftshader']}});
test.setTimeout(120000);
const source={name:'Solid motif',width:12,height:6,columns:2,rows:2,pixels:[0,255,0,255,0,255,0,255]};
const seal=(patch={})=>({id:'seal',name:'Spaced seal',kind:'seal',operation:'new',target:null,source,around:1,vertical:1,diameter:12/Math.PI,depth:1,detail:.8,engrave:'darkest',mirror:false,...patch});
const recipe=feature=>({version:1,features:[feature]});

test('repeat gaps preserve physical motif sizes and exact blank bands in CAD/photo meshes',()=>{
 for(const surface of ['cad','photo'])for(const effect of ['emboss','deboss'])for(const [gapAround,gapVertical] of [[1.5,2],[.03,.07]]){
  const feature=seal({surface,effect,around:2,vertical:2,gapAround,gapVertical,diameter:2*(12+gapAround)/Math.PI,detail:.8,marginTop:.2,marginBottom:.3,draftAngle:effect==='emboss'?45:0});
  const grid=sealGrid(feature),mesh=sealMesh(feature),radius=feature.diameter/2;
  expect(sealMinimumDiameter(feature)).toBeCloseTo(feature.diameter,10);expect(grid.height).toBeCloseTo(12+gapVertical+.5,10);expect(meshComponents({vertices:Array.from(mesh.vertices),triangles:Array.from(mesh.triangles)})).toHaveLength(1);
  const distances=[],levels=[];let visible=0,blank=0;
  for(let j=0;j<=grid.rows;j++)for(let i=0;i<grid.columns;i++){
   const offset=(j*grid.columns+i)*3,[x,y,z]=Array.from(mesh.vertices.slice(offset,offset+3));
   const d=((Math.atan2(y,x)+2*Math.PI)%(2*Math.PI))*radius,across=d%(12+gapAround),down=(grid.height-.2-z)%(6+gapVertical),r=Math.hypot(x,y);
   if(j===0)distances.push(d);if(i===0)levels.push(z);
   if(across>12-1e-5||across<1e-5||z>.3+6-1e-5&&z<.3+6+gapVertical+1e-5){expect(r).toBeCloseTo(radius,5);blank++;}
   if(across>3&&across<9&&down>2&&down<4&&Math.abs(r-radius)>.1)visible++;
  }
  for(const edge of [12,12+gapAround,24+gapAround])expect(Math.min(...distances.map(d=>Math.abs(d-edge)))).toBeLessThan(1e-5);
  for(const edge of [.3+6,.3+6+gapVertical])expect(Math.min(...levels.map(z=>Math.abs(z-edge)))).toBeLessThan(1e-5);
  expect(visible).toBeGreaterThan(0);expect(blank).toBeGreaterThan(0);expect(validModel(recipe(feature))).toBe(true);expect(readModel(recipe(feature))).toEqual(recipe(feature));
 }
});

test('gapped seals export watertight STL and CAD STEP',async()=>{
 cad.setOC(await initOpenCascade());
 for(const surface of ['cad','photo']){
  const feature=seal({surface,around:2,vertical:2,gapAround:1,gapVertical:1,diameter:26/Math.PI,detail:1}),bodies=buildModel(recipe(feature));
  try{assertPrintableSTL(await exportModel(bodies,'stl').arrayBuffer());if(surface==='cad')expect(exportModel(bodies,'step').size).toBeGreaterThan(1000);}
  finally{disposeBodies(bodies);}
 }
});

test('repeat gaps validate, default to the old layout, and stay within mesh limits',()=>{
 expect(sealMesh(seal())).toEqual(sealMesh(seal({gapAround:0,gapVertical:0})));
 for(const key of ['gapAround','gapVertical'])for(const value of [-1,NaN,Infinity,null,10001])expect(validModel(recipe(seal({[key]:value})))).toBe(false);
 expect(sealError(seal({vertical:2,gapVertical:10000}))).toContain('height');expect(sealError(seal({gapAround:1}))).toContain('Diameter must fit');
 for(const surface of ['cad','photo']){
  const feature=seal({surface,around:16,vertical:16,gapAround:.03,gapVertical:.07,diameter:(12+.03)*16/Math.PI,detail:.1}),mesh=sealMesh(feature),grid=sealGrid(feature);
  expect(grid.columns*(grid.rows+1)).toBeLessThanOrEqual(surface==='photo'?524288:4608);if(surface==='cad')expect(meshComponents(mesh)).toHaveLength(1);
 }
});

test('draft uses physical distances between unevenly spaced wrap samples',()=>{
 const heights=draftSealHeights(Float64Array.from([0,1,1,1]),4,[0],Float64Array.from([.1,.2,.5,.8]),45);
 for(const [index,value] of [0,.1,.3,.8].entries())expect(heights[index]).toBeCloseTo(value,10);
});

test('repeat gaps resize the seal and survive units, cancel, Undo, SVG and recovery',async({page})=>{
 const motif='<svg xmlns="http://www.w3.org/2000/svg" width="120" height="24"><path id="Motif" d="M0 0H120V24H0Z M12 6V18H24V6Z" fill="black" fill-rule="evenodd"/></svg>';
 await open(page,motif);const before=await snapshot(page);await choose(page,'seal');
 await expect(page.locator('#model3d-seal-gapAround')).toHaveValue('0');await expect(page.locator('#model3d-seal-gapVertical')).toHaveValue('0');
 await page.locator('#model3d-seal-around').fill('2');await page.locator('#model3d-seal-vertical').fill('3');await page.locator('#model3d-seal-gapAround').fill('1.5');await page.locator('#model3d-seal-gapVertical').fill('2.25');
 expect(Number(await page.locator('#model3d-seal-diameter').inputValue())).toBeCloseTo(66.5/Math.PI,5);await expect(page.locator('#model3d-seal-size')).toContainText('Height 23.55 mm');
 await page.locator('#model3d-seal-diameter').fill('30');await page.locator('#model3d-seal-gapAround').fill('2');expect(Number(await page.locator('#model3d-seal-diameter').inputValue())).toBeCloseTo(30+1/Math.PI,5);
 await page.locator('#model3d-seal-gapVertical').fill('-1');await expect(page.locator('#model3d-preview')).toBeDisabled();await expect(page.locator('#model3d-tool-error')).toContainText('nonnegative repeat gaps');await page.locator('#model3d-seal-gapVertical').fill('2.25');
 await page.locator('#model3d-unit').selectOption('in');expect(Number(await page.locator('#model3d-seal-gapAround').inputValue())).toBeCloseTo(2/25.4,6);
 await page.locator('#model3d-name').fill('Spaced seal');await page.locator('#model3d-unit').selectOption('mm');await expect(page.locator('#model3d-seal-gapAround')).toHaveValue('2');await expect(page.locator('#model3d-seal-gapVertical')).toHaveValue('2.25');
 await page.locator('#model3d-seal-detail').fill('.8');await preview(page);expect(await snapshot(page)).toBe(before);
 await page.setViewportSize({width:390,height:844});await page.locator('#model3d-seal-gapAround').scrollIntoViewIfNeeded();expect(await page.locator('#model3d-dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);await page.screenshot({path:'/tmp/vector-lab-seal-repeat-gaps-mobile.png'});await page.setViewportSize({width:1024,height:768});
 await page.locator('#model3d-apply-tool').click();await page.locator('#model3d-apply').click();const model=await stored(page);expect(model.features[0]).toMatchObject({gapAround:2,gapVertical:2.25,around:2,vertical:3});expect(model.features[0].source.width).toBeCloseTo(31.75,6);expect(model.features[0].source.height).toBeCloseTo(6.35,6);
 await page.locator('#canvas-undo').click();expect(await snapshot(page)).toBe(before);await page.locator('#canvas-redo').click();expect(await stored(page)).toEqual(model);
 await page.reload();await page.locator('#model3d-open').click();await idle(page);await editLast(page);await expect(page.locator('#model3d-seal-gapAround')).toHaveValue('2');await expect(page.locator('#model3d-seal-gapVertical')).toHaveValue('2.25');await page.locator('#model3d-seal-gapAround').fill('4');await preview(page);await page.locator('#model3d-cancel').click();expect(await stored(page)).toEqual(model);
 await page.locator('#save').click();const waiting=page.waitForEvent('download');await page.locator('#download-svg').click();const file=await(await waiting).path();page.once('dialog',dialog=>dialog.accept());await page.locator('#file').setInputFiles(file);await expect(page.locator('#status')).toContainText('SVG opened');expect(await stored(page)).toEqual(model);
});
