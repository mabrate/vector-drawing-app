import {test,expect} from '@playwright/test';
import initOpenCascade from 'replicad-opencascadejs';
import * as cad from 'replicad';
import paper from 'paper';
import {validModel,readModel,withoutFeature,selectionProfiles,MM_PER_PIXEL} from '../src/model3d-data.js';
import {buildModel,modelMeshes,disposeBodies,exportModel} from '../src/model3d-kernel.js';
import {assertPrintableSTL} from '../src/model3d-chamfer.js';
import {cookieError} from '../src/model3d-cookie.js';
import opentype from 'opentype.js';
import {readFileSync} from 'node:fs';

const wire=points=>points.map((a,i)=>[a,a,points[(i+1)%points.length],points[(i+1)%points.length]]);
const rect=(x,y,w,h)=>({outer:wire([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]),holes:[]});
const shape=(name,profile)=>({name,profile});
const cutter=(patch={})=>({id:'cookie',name:'Cookie cutter',kind:'cookie',operation:'new',target:null,cut:shape('Outline',[rect(0,0,40,30)]),emboss:[],wallThickness:1,cutHeight:15,baseOffset:3,baseThickness:2,baseMode:'solid',embossSetback:3,draftAngle:5,bridgeWidth:2,...patch});
const model=feature=>({version:1,features:[feature]});
test.beforeAll(async()=>{cad.setOC(await initOpenCascade());paper.setup(new paper.Size(1000,1000));});

test('cut walls have the requested thickness and height above a bottom solid or open base',()=>{
 for(const baseMode of ['solid','open']){
  const feature=cutter({baseMode}),before=JSON.stringify(feature),bodies=buildModel(model(feature));
  try{
   expect(cad.measureVolume(bodies.get('cookie').shape)).toBeCloseTo((46*36-(baseMode==='open'?40*30:0))*2+(42*32-40*30)*15,6);
   const box=bodies.get('cookie').shape.boundingBox;try{expect(box.bounds[0]).toEqual([-3,-3,0]);expect(box.bounds[1]).toEqual([43,33,17]);}finally{box.delete();}
   expect(JSON.stringify(feature)).toBe(before);expect(validModel(model(feature))).toBe(true);
  }finally{disposeBodies(bodies);}
 }
});

test('draft holds the emboss top exactly as drawn and flares down to the base',()=>{
 const design=shape('Design',[rect(15,10,10,8)]),feature=cutter({emboss:[design]}),before=JSON.stringify(feature),bodies=buildModel(model(feature));
 try{
  const h=12,spread=h*Math.tan(5*Math.PI/180),stamp=h*(80+18*spread+4/3*spread**2);
  expect(cad.measureVolume(bodies.get('cookie').shape)).toBeCloseTo(5472+stamp,5);
  const top=modelMeshes(bodies)[0].faces.find(face=>face.label.includes('Z 14 mm'));expect(top).toBeTruthy();
  const caps=bodies.get('cookie').shape.faces;
  try{const cap=caps.find(face=>{const box=face.boundingBox;try{return Math.abs(box.bounds[0][2]-14)<1e-7&&Math.abs(box.bounds[1][2]-14)<1e-7;}finally{box.delete();}});const box=cap.boundingBox;try{for(const [i,point] of [[15,10,14],[25,18,14]].entries())for(let axis=0;axis<3;axis++)expect(box.bounds[i][axis]).toBeCloseTo(point[axis],6);}finally{box.delete();}}finally{caps.forEach(face=>face.delete());}
  expect(JSON.stringify(feature)).toBe(before);
 }finally{disposeBodies(bodies);}
});

test('open bases add low bridges to attach independent emboss islands in one printable solid',async()=>{
 const feature=cutter({baseMode:'open',draftAngle:0,emboss:[shape('Island',[rect(15,10,10,8)])]}),bodies=buildModel(model(feature));
 try{
  expect(cad.measureVolume(bodies.get('cookie').shape)).toBeCloseTo(3072+960+44,5);
  const solids=bodies.get('cookie').shape.solids;try{expect(solids).toHaveLength(1);}finally{solids.forEach(solid=>solid.delete());}
  assertPrintableSTL(await exportModel(bodies,'stl').arrayBuffer());expect(exportModel(bodies,'step').size).toBeGreaterThan(1000);
 }finally{disposeBodies(bodies);}
});

test('curved cutter and emboss outlines retain holes, transforms, snapshots and valid CAD exports',async()=>{
 const circle=(center,radius)=>new paper.Path.Circle({center:center.map(n=>n/MM_PER_PIXEL),radius:radius/MM_PER_PIXEL,insert:false});
 const outline=circle([50,-50],20),art=new paper.CompoundPath({children:[circle([50,-50],6),circle([50,-50],3)],fillRule:'evenodd',insert:false});
 art.applyMatrix=false;art.rotate(20);const before=art.exportJSON();
 const feature=cutter({baseMode:'open',draftAngle:3,cut:shape('Round outline',selectionProfiles(paper,[outline])),emboss:[shape('Ring',selectionProfiles(paper,[art]))]}),bodies=buildModel(model(feature));
 try{expect(readModel(model(feature))).toEqual(model(feature));assertPrintableSTL(await exportModel(bodies,'stl').arrayBuffer());expect(exportModel(bodies,'step').size).toBeGreaterThan(1000);expect(art.exportJSON()).toBe(before);}finally{disposeBodies(bodies);outline.remove();art.remove();}
});

test('concave outlines and internal cutting holes keep an open base connected',()=>{
 const cut={outer:wire([[0,0],[50,0],[50,40],[30,40],[30,25],[20,25],[20,40],[0,40]]),holes:[rect(5,5,8,6).outer]};
 const feature=cutter({baseMode:'open',cut:shape('Notched outline',[cut]),emboss:[shape('Small design',[rect(35,10,5,5)])]}),bodies=buildModel(model(feature));
 try{const solids=bodies.get('cookie').shape.solids;try{expect(solids).toHaveLength(1);}finally{solids.forEach(solid=>solid.delete());}expect(cad.measureVolume(bodies.get('cookie').shape)).toBeGreaterThan(0);}finally{disposeBodies(bodies);}
});

test('an outlined font glyph retains its curved top and counters in a drafted cutter',async()=>{
 const bytes=readFileSync(new URL('../public/fonts/arimo/400.ttf',import.meta.url)),font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 const letter=new paper.CompoundPath({pathData:font.getPath('B',0,0,60).toPathData(6),insert:false});
 letter.scale(14/(letter.bounds.height*MM_PER_PIXEL));letter.position=[20/MM_PER_PIXEL,-15/MM_PER_PIXEL];
 const ellipse=new paper.Path.Ellipse({rectangle:new paper.Rectangle(0,-30/MM_PER_PIXEL,40/MM_PER_PIXEL,30/MM_PER_PIXEL),insert:false});
 const profile=selectionProfiles(paper,[letter]),before=letter.exportJSON(),feature=cutter({draftAngle:1,cut:shape('Oval outline',selectionProfiles(paper,[ellipse])),emboss:[shape('Letter B',profile)]}),bodies=buildModel(model(feature));
 try{
  expect(profile[0].holes).toHaveLength(2);assertPrintableSTL(await exportModel(bodies,'stl').arrayBuffer());
  const step=exportModel(bodies,'step');expect(step.size).toBeGreaterThan(1000);const imported=await cad.importSTEP(step);
  try{expect(cad.measureVolume(imported)).toBeCloseTo(cad.measureVolume(bodies.get('cookie').shape),3);const box=imported.boundingBox;try{expect(box.bounds.flat().every(n=>Number.isFinite(n)&&Math.abs(n)<100)).toBe(true);}finally{box.delete();}}finally{imported.delete();}
  expect(letter.exportJSON()).toBe(before);
 }finally{disposeBodies(bodies);letter.remove();ellipse.remove();}
});

test('malformed and impossible cutter dimensions fail and invalid geometry leaves its recipe intact',()=>{
 for(const patch of [{cut:null},{wallThickness:0},{cutHeight:NaN},{baseOffset:.5},{baseThickness:-1},{baseMode:'floating'},{embossSetback:0},{draftAngle:61},{bridgeWidth:0},{emboss:null},{cut:{name:'Bad',profile:[]}}])expect(validModel(model(cutter(patch)))).toBe(false);
 const high=cutter({embossSetback:15,emboss:[shape('Design',[rect(10,10,5,5)])]});expect(cookieError(high)).toContain('below');
 const outside=cutter({emboss:[shape('Outside',[rect(60,10,5,5)])]}),before=JSON.stringify(outside);expect(()=>buildModel(model(outside))).toThrow(/inside the cut outline/);expect(JSON.stringify(outside)).toBe(before);
 const coversHole=cutter({cut:shape('Outline with hole',[{...rect(0,0,40,30),holes:[rect(18,13,4,4).outer]}]),emboss:[shape('Covers internal cutout',[rect(15,10,10,10)])]});expect(()=>buildModel(model(coversHole))).toThrow(/internal cut holes/);
 const hole=cutter({draftAngle:45,emboss:[shape('Tiny hole',[{...rect(10,10,10,10),holes:[rect(14,14,1,1).outer]}])]});expect(()=>buildModel(model(hole))).toThrow(/collapses|draft/);
 expect(withoutFeature({version:1,features:[cutter(),{id:'child',operation:'join',target:'cookie'}]},'cookie').features).toEqual([]);
});
