import {test,expect} from '@playwright/test';
import initOpenCascade from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {sealMesh,sealGrid,sealStrength,sealMinimumDiameter,sealError} from '../src/model3d-seal.js';
import {validModel,readModel,withoutFeature} from '../src/model3d-data.js';
import {meshComponents,readSTL} from '../src/model3d-stl.js';
import {buildModel,modelMeshes,disposeBodies,exportModel} from '../src/model3d-kernel.js';
const source={name:'Three values',width:30,height:6,columns:3,rows:2,pixels:[0,255,128,255,255,255,0,255,128,255,255,255]};
const seal=(patch={})=>({id:'seal',name:'Cylinder seal',kind:'seal',operation:'new',target:null,source,around:1,vertical:1,diameter:30/Math.PI,depth:1,detail:1,engrave:'darkest',mirror:false,...patch});
const recipe=feature=>({version:1,features:[feature]});
test.beforeAll(async()=>cad.setOC(await initOpenCascade()));

test('color values, polarity and alpha give proportional engraving depths',()=>{
  for(const [u,value] of [[1/6,0],[.5,128],[5/6,255]]){
    expect(sealStrength(source,u,.5,'darkest')).toBeCloseTo(1-value/255,8);
    expect(sealStrength(source,u,.5,'lightest')).toBeCloseTo(value/255,8);
  }
  const transparent={...source,pixels:source.pixels.map((v,i)=>i%2?0:v)};
  for(const polarity of ['darkest','lightest'])expect(sealStrength(transparent,.5,.5,polarity)).toBe(0);
});

test('wrap sizing, horizontal and vertical repeats, blank circumference and mirroring preserve physical artwork size',()=>{
  const base=seal(),repeated=seal({around:3,vertical:2,diameter:90/Math.PI});
  expect(sealMinimumDiameter(repeated)).toBeCloseTo(base.diameter*3,10);expect(sealGrid(repeated).height).toBe(12);
  const radiusAt=(f,i,j=0)=>{const mesh=sealMesh(f),index=(j*sealGrid(f).columns+i)*3;return Math.hypot(...mesh.vertices.slice(index,index+2));};
  expect(radiusAt(base,0)).toBeCloseTo(base.diameter/2-1,8);
  expect(radiusAt({...base,mirror:true},0)).toBeCloseTo(base.diameter/2,8);
  const larger={...base,diameter:base.diameter*2},grid=sealGrid(larger);
  expect(radiusAt(larger,Math.floor(grid.columns*.75))).toBeCloseTo(larger.diameter/2,8);
  // Exact full tiles repeat without stretching along either axis.
  const tiled=seal({around:2,vertical:2,diameter:60/Math.PI}),mesh=sealMesh(tiled),g=sealGrid(tiled);
  for(let j=0;j<=g.rows/2;j++)for(let i=0;i<g.columns/2;i++){
    const radius=(a,b)=>Math.hypot(...mesh.vertices.slice((b*g.columns+a)*3,(b*g.columns+a)*3+2));
    expect(radius(i,j)).toBeCloseTo(radius(i+g.columns/2,j),7);
    expect(radius(i,j)).toBeCloseTo(radius(i,j+g.rows/2),7);
  }
});

test('seals are watertight CAD solids and STL/STEP retain real engraved geometry',async()=>{
  for(const patch of [{},{engrave:'lightest',mirror:true},{around:2,vertical:2,diameter:75/Math.PI}]){
    const feature=seal(patch),mesh=sealMesh(feature);expect(meshComponents(mesh)).toHaveLength(1);
    const model=recipe(feature);expect(validModel(model)).toBe(true);expect(readModel(model)).toEqual(model);
    const bodies=buildModel(model);
    try{
      const shape=bodies.get('seal').shape,checker=new (cad.getOC()).BRepCheck_Analyzer(shape.wrapped);
      try{expect(checker.IsValid()).toBe(true);}finally{checker.delete();}
      const volume=cad.measureVolume(shape);expect(volume).toBeGreaterThan(0);expect(volume).toBeLessThan(Math.PI*(feature.diameter/2)**2*source.height*feature.vertical);
      const preview=modelMeshes(bodies);expect(preview[0].volume).toBeCloseTo(volume,6);
      const stl=readSTL(await exportModel(bodies,'stl').arrayBuffer());expect(meshComponents(stl)).toHaveLength(1);
      expect(exportModel(bodies,'step').size).toBeGreaterThan(1000);
    }finally{disposeBodies(bodies);}
  }
});

test('invalid sizes and snapshots fail and extreme aspect ratios keep a bounded manifold grid',()=>{
  for(const patch of [{diameter:1},{depth:10},{depth:0},{around:1.5},{vertical:17},{detail:.01},{engrave:'red'},{source:null},{source:{...source,pixels:[0,255]}}]){
    expect(sealError(seal(patch))).not.toBe('');expect(validModel(recipe(seal(patch)))).toBe(false);
  }
  for(const [width,height,around,vertical] of [[1000,.1,1,1],[.1,1000,1,1],[30,6,16,16]]){
    const f=seal({source:{...source,width,height},around,vertical,diameter:Math.max(10,width*around/Math.PI),detail:.1}),mesh=sealMesh(f);
    expect(mesh.triangles.length/3).toBeLessThanOrEqual(10000);expect(meshComponents(mesh)).toHaveLength(1);
  }
  expect(withoutFeature({version:1,features:[seal(),{id:'child',target:'seal'}]},'seal').features).toEqual([]);
});

// A detailed portrait-sized relief should stay in the mesh pipeline, rather
// than silently dropping to the old ~68 × 68 CAD surface.
test('photo seals retain fine image values and export dense closed STL without CAD conversion',async()=>{
  const {packSealPixels,sealPixels}=await import('../src/model3d-seal.js');
  const columns=512,rows=768,pixels=new Uint8Array(columns*rows*2);
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const i=(y*columns+x)*2;pixels[i]=Math.round(128+60*Math.sin(x*.7)*Math.cos(y*.4));pixels[i+1]=255;}
  const photoSource={name:'Portrait detail',width:40,height:60,columns,rows,...packSealPixels(pixels)};
  expect(photoSource.channels).toBe(1);expect(sealPixels(photoSource)).toEqual(pixels);
  const feature=seal({source:photoSource,surface:'photo',diameter:40/Math.PI,detail:.2});
  const grid=sealGrid(feature),coarse=sealGrid({...feature,surface:'cad'});
  expect(grid.pitch).toBeLessThanOrEqual(.2);expect(grid.columns*grid.rows).toBeGreaterThan(coarse.columns*coarse.rows*10);
  const bodies=buildModel(recipe(feature));
  try{
    expect(bodies.get('seal').shape).toBeUndefined();const preview=modelMeshes(bodies)[0];expect(preview.photoSeal).toBe(true);expect(preview.mesh.triangles.length/3).toBeGreaterThan(100000);
    const blob=await exportModel(bodies,'stl'),buffer=await blob.arrayBuffer(),view=new DataView(buffer);expect(view.getUint32(80,true)).toBe(preview.mesh.triangles.length/3);
    const {assertPrintableSTL}=await import('../src/model3d-chamfer.js');assertPrintableSTL(buffer);
    expect(()=>exportModel(bodies,'step')).toThrow(/Photo STL/);
    expect(readModel(recipe(feature))).toEqual(recipe(feature));
    const fine=sealGrid({...feature,detail:.02});expect(fine.columns*(fine.rows+1)).toBeLessThanOrEqual(524288);expect(fine.limited).toBe(true);
    // Gray differences at photographic scales survive in actual vertex radii.
    const mesh=preview.mesh,radius=feature.diameter/2,j=Math.floor(grid.rows/2),i=Math.floor(grid.columns/3),distance=i/grid.columns*grid.circumference;
    const expected=radius-feature.depth*sealStrength(photoSource,(distance/photoSource.width)%1,1-j/grid.rows,'darkest');
    expect(Math.hypot(mesh.vertices[(j*grid.columns+i)*3],mesh.vertices[(j*grid.columns+i)*3+1])).toBeCloseTo(expected,5);
  }finally{disposeBodies(bodies);}
});

test('packed alpha, malformed snapshots, mixed exports, cached meshes and CAD edits are handled explicitly',async()=>{
  const {packSealPixels,sealPixels,validSealSource}=await import('../src/model3d-seal.js');
  const {createModelBuildCache}=await import('../src/model3d-kernel.js');
  const pixels=Uint8Array.from(source.pixels);pixels[1]=0;const packed={...source,...packSealPixels(pixels)};delete packed.pixels;
  expect(packed.channels).toBe(2);expect(validSealSource(packed)).toBe(true);expect(sealPixels(packed)).toEqual(pixels);
  for(const patch of [{packed:'!!!!'},{packed:packed.packed.slice(1)},{channels:3},{pixels:[1,2]}])expect(validSealSource({...packed,...patch})).toBe(false);
  const photo=seal({surface:'photo',source:packed}),cadFeature=seal({id:'cad',name:'CAD seal'}),model={version:1,features:[photo,cadFeature]},cache=createModelBuildCache();
  for(let i=0;i<2;i++){const bodies=buildModel(model,{cache});try{const blob=await exportModel(bodies,'stl');expect(new DataView(await blob.arrayBuffer()).getUint32(80,true)).toBeGreaterThan(sealMesh(photo).triangles.length/3);}finally{disposeBodies(bodies);}}
  cache.dispose();
  expect(()=>buildModel({version:1,features:[photo,{id:'shell',name:'Shell',kind:'shell',target:'seal',thickness:1,direction:'inside',faces:['cap']}]})).toThrow(/Choose CAD \/ STEP/);
});

test('top and bottom margins are exact blank bands and keep artwork and repeats at their original size',()=>{
  const solidSource={name:'Black motif',width:30,height:6,columns:2,rows:2,pixels:[0,255,0,255,0,255,0,255]};
  for(const surface of ['cad','photo'])for(const effect of ['deboss','emboss']){
    const feature=seal({source:solidSource,surface,effect,around:2,vertical:2,diameter:75/Math.PI,detail:.5,marginTop:1.3,marginBottom:.25}),grid=sealGrid(feature),mesh=sealMesh(feature),radius=feature.diameter/2;
    const base=sealGrid({...feature,marginTop:0,marginBottom:0});expect(grid.artHeight).toBe(12);expect(grid.height).toBe(13.55);expect(grid.artRows).toBe(base.artRows);expect(grid.columns).toBe(base.columns);
    const point=(j,i=0)=>Array.from(mesh.vertices.slice((j*grid.columns+i)*3,(j*grid.columns+i)*3+3));
    for(const j of [0,1,grid.rows-1,grid.rows])for(let i=0;i<grid.columns;i++){const p=point(j,i);expect(Math.hypot(p[0],p[1])).toBeCloseTo(radius,5);}
    expect(point(1)[2]).toBeCloseTo(.25,6);expect(point(grid.rows-1)[2]).toBeCloseTo(12.25,6);expect(point(grid.rows)[2]).toBeCloseTo(13.55,6);
    const mid=point(Math.floor(grid.rows/2));expect(Math.hypot(mid[0],mid[1])).toBeCloseTo(radius+(effect==='emboss'?1:-1),5);
    const blank=point(Math.floor(grid.rows/2),Math.floor(grid.columns*.9));expect(Math.hypot(blank[0],blank[1])).toBeCloseTo(radius,5);
    expect(validModel(recipe(feature))).toBe(true);expect(readModel(recipe(feature))).toEqual(recipe(feature));
    expect(grid.columns*(grid.rows+1)).toBeLessThanOrEqual(surface==='photo'?524288:4608);
  }
});

test('emboss adds material, deboss removes material, and both margin variants export closed CAD and photo solids',async()=>{
  const {assertPrintableSTL}=await import('../src/model3d-chamfer.js');
  for(const surface of ['cad','photo'])for(const effect of ['emboss','deboss'])for(const margins of [{marginTop:.03,marginBottom:0},{marginTop:0,marginBottom:.07},{marginTop:1.2,marginBottom:.4}]){
    const feature=seal({surface,effect,...margins}),bodies=buildModel(recipe(feature));
    try{
      const plain=seal({surface,effect,depth:.00001,...margins}),plainBodies=buildModel(recipe(plain));
      try{const volume=body=>body.photoSeal?body.volume:cad.measureVolume(body.shape),actual=volume(bodies.get('seal')),baseline=volume(plainBodies.get('seal'));expect(effect==='emboss'?actual>baseline:actual<baseline).toBe(true);}finally{disposeBodies(plainBodies);}
      assertPrintableSTL(await exportModel(bodies,'stl').arrayBuffer());if(surface==='cad')expect(exportModel(bodies,'step').size).toBeGreaterThan(1000);
    }finally{disposeBodies(bodies);}
  }
  expect(sealError(seal({effect:'emboss',depth:10}))).toBe('');expect(sealError(seal({effect:'deboss',depth:10}))).toMatch(/radius/);
  for(const patch of [{effect:'paint'},{marginTop:-1},{marginBottom:NaN},{marginTop:null},{marginBottom:Infinity},{marginTop:9999}])expect(validModel(recipe(seal(patch)))).toBe(false);
  const original=seal(),explicit={...original,effect:'deboss',marginTop:0,marginBottom:0};expect(sealMesh(original)).toEqual(sealMesh(explicit));
});

test('draft tapers raised path edges into bounded upright-print slopes without expanding the footprint',()=>{
  const pixels=[];for(let y=0;y<64;y++)for(let x=0;x<64;x++)pixels.push(0,x>=16&&x<48&&y>=16&&y<48?255:0);
  const motif={name:'Sharp path',width:24,height:24,columns:64,rows:64,pixels};
  for(const surface of ['cad','photo'])for(const draftAngle of [30,45,60]){
    const feature=seal({source:motif,surface,effect:'emboss',depth:2,diameter:24/Math.PI,detail:.5,marginTop:.3,marginBottom:.7,draftAngle}),grid=sealGrid(feature),plain=sealMesh({...feature,draftAngle:0}),mesh=sealMesh(feature),radius=feature.diameter/2,slope=1/Math.tan(draftAngle*Math.PI/180);
    const r=(data,i)=>Math.hypot(data.vertices[i*3],data.vertices[i*3+1]);let peak=0,changed=false,expansion=0,minimum=Infinity,blankError=0,slopeExcess=0,worstNormal=1;
    for(let j=0;j<=grid.rows;j++)for(let i=0;i<grid.columns;i++){
      const index=j*grid.columns+i,actual=r(mesh,index),original=r(plain,index);expansion=Math.max(expansion,actual-original);minimum=Math.min(minimum,actual);peak=Math.max(peak,actual-radius);if(actual<original-.01)changed=true;
      if(Math.abs(original-radius)<1e-5)blankError=Math.max(blankError,Math.abs(actual-radius));
      if(j){const prior=index-grid.columns,dz=mesh.vertices[index*3+2]-mesh.vertices[prior*3+2];slopeExcess=Math.max(slopeExcess,Math.abs(actual-r(mesh,prior))-slope*dz);}
    }
    expect(expansion).toBeLessThan(1e-5);expect(minimum).toBeGreaterThan(radius-1e-5);expect(blankError).toBeLessThan(1e-5);expect(slopeExcess).toBeLessThan(1e-5);expect(changed).toBe(true);expect(peak).toBeCloseTo(2,5);
    // Every side triangle, including diagonal contour edges, respects the
    // requested downward-facing overhang angle in actual cylinder coordinates.
    for(let i=0;i<grid.columns*grid.rows*6;i+=3){
      const [a,b,c]=Array.from(mesh.triangles.slice(i,i+3),index=>Array.from(mesh.vertices.slice(index*3,index*3+3))),u=b.map((n,j)=>n-a[j]),v=c.map((n,j)=>n-a[j]);
      const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      worstNormal=Math.min(worstNormal,normal[2]/Math.hypot(...normal));
    }
    expect(worstNormal).toBeGreaterThanOrEqual(-Math.cos(draftAngle*Math.PI/180)-1e-5);
    expect(validModel(recipe(feature))).toBe(true);expect(readModel(recipe(feature))).toEqual(recipe(feature));
  }
  for(const patch of [{draftAngle:-1},{draftAngle:81},{draftAngle:NaN},{draftAngle:null}])expect(validModel(recipe(seal(patch)))).toBe(false);
  expect(sealMesh(seal())).toEqual(sealMesh(seal({draftAngle:0})));
  expect(sealMesh(seal({effect:'deboss',draftAngle:45}))).toEqual(sealMesh(seal({effect:'deboss',draftAngle:0})));
});

test('draft wraps across the cylinder seam, uses physical margin distances, and leaves its source untouched',async()=>{
  const {draftSealHeights}=await import('../src/model3d-seal-draft.js');
  const input=Float64Array.from([0,1,1,1]);expect(Array.from(draftSealHeights(input,4,[0],.1,45))).toEqual([0,.10000000000000003,.20000000000000007,.10000000000000003]);expect(Array.from(input)).toEqual([0,1,1,1]);
  const rows=draftSealHeights(Float64Array.from([0,0,0,0,1,1,1,1,1,1,1,1]),4,[0,.1,5],.1,45);expect(rows[4]).toBeCloseTo(.1,8);expect(rows[8]).toBe(1);
  const diagonal=draftSealHeights(Float64Array.from([0,1,1,1,1,1,1,1]),4,[0,.1],.1,45);expect(diagonal[5]).toBeCloseTo(Math.SQRT2*.1,8);
});

test('drafted embossed patterns retain repeats, mirrors and blank bands in watertight STL and STEP',async()=>{
  const {assertPrintableSTL}=await import('../src/model3d-chamfer.js');
  for(const surface of ['cad','photo']){
    const feature=seal({surface,effect:'emboss',draftAngle:45,around:2,vertical:2,mirror:true,diameter:70/Math.PI,detail:.75,marginTop:.25,marginBottom:.5}),bodies=buildModel(recipe(feature));
    try{const stl=await exportModel(bodies,'stl').arrayBuffer();assertPrintableSTL(stl);if(surface==='cad')expect(exportModel(bodies,'step').size).toBeGreaterThan(1000);}
    finally{disposeBodies(bodies);}
  }
});
