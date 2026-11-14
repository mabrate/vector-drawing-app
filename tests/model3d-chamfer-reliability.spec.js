import {test,expect} from '@playwright/test';
import initOpenCascade from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildModel,modelMeshes,disposeBodies,edgeSignature,createModelBuildCache} from '../src/model3d-kernel.js';
import {chamferCatalog,resolveChamfer,smallerChamferSizes} from '../src/model3d-chamfer-analysis.js';
import {buildChamfer,assertPrintableMesh,assertPrintableSTL} from '../src/model3d-chamfer.js';
import {validModel,readModel} from '../src/model3d-data.js';
import {boxMesh,binarySTL,arrayBuffer} from './helpers/model3d-stl.js';

test.setTimeout(120000);
test.beforeAll(async()=>cad.setOC(await initOpenCascade()));
const source=()=>({id:'box',name:'Box',kind:'stl',operation:'new',target:null,mesh:boxMesh(),scale:1});
const recipe=(...features)=>({version:1,features});
function topFeature(shape){const contour=chamferCatalog(shape,edgeSignature).find(c=>c.kind==='outside-rim'&&c.side===1);return {id:'bevel',name:'Chamfer',kind:'chamfer',target:'box',amount:.5,edges:contour.keys};}

test('recognizes four boundary types and builds prepared cavity and hole bevels without damaging other surfaces',()=>{
  const base=cad.makeBox([-15,-15,0],[15,15,10]),tool=cad.makeBox([-5,-5,3],[5,5,11]),shape=base.cut(tool),catalog=chamferCatalog(shape,edgeSignature);
  try{
    expect(catalog.map(c=>c.kind)).toEqual(expect.arrayContaining(['outside-rim','hole-rim','cavity-junction']));
    for(const kind of ['cavity-junction','hole-rim']){
      const contour=catalog.find(c=>c.kind===kind&&c.side===1),result=buildChamfer(shape,{id:'test',amount:1,edges:contour.keys,cleanupTolerance:.01},edgeSignature);
      try{
        expect(result.report.method).toBe('contour');expect(result.report.tolerance).toBe(.03);assertPrintableMesh(result.shape.mesh());
        expect(cad.measureVolume(result.shape)).toBeGreaterThan(8250);expect(cad.measureVolume(result.shape)).toBeLessThan(8350);
        const probe=cad.makeBox([-2,-2,5],[2,2,9]),common=result.shape.intersect(probe);
        try{expect(Math.abs(cad.measureVolume(common))).toBeLessThan(1e-6);}finally{common.delete();probe.delete();}
      }finally{result.shape.delete();}
    }
    expect(cad.measureVolume(shape)).toBeCloseTo(8300,6);
  }finally{shape.delete();tool.delete();base.delete();}
});

test('multiple complete contours are handled together and partial selections remain native operations',()=>{
  const outer=cad.makeCylinder(15,5),inner=cad.makeCylinder(5,6),shape=outer.cut(inner),catalog=chamferCatalog(shape,edgeSignature),upper=catalog.filter(c=>c.side===1&&c.z===5);
  try{
    const result=buildChamfer(shape,{id:'all',amount:.5,edges:upper.flatMap(c=>c.keys),cleanupTolerance:.01},edgeSignature);
    try{assertPrintableMesh(result.shape.mesh());expect(result.report.complete).toBe(true);expect(cad.measureVolume(result.shape)).toBeLessThan(cad.measureVolume(shape));}finally{result.shape.delete();}
  }finally{shape.delete();inner.delete();outer.delete();}
});

test('saved contour intent follows translated and resized sources without mutating the recipe, and rejects ambiguous matches',()=>{
  const original=source(),initial=buildModel(recipe(original));let feature;
  try{feature=topFeature(initial.get('box').shape);}finally{disposeBodies(initial);}
  let patch;const first=buildModel(recipe(original,feature),{onFeatureResolved(id,value){patch=value;}});disposeBodies(first);feature={...feature,...patch};
  for(const transform of [n=>n+30,n=>n*1.5]){
    const changed=structuredClone(original);changed.mesh.vertices=changed.mesh.vertices.map((n,i)=>i%3===0?transform(n):n);
    const model=recipe(changed,feature),before=JSON.stringify(model),bodies=buildModel(model,{onFeatureResolved(id,value){patch=value;}});
    try{expect(patch.edges).not.toEqual(feature.edges);expect(bodies.get('box').chamfers[0].rebound).toBe(true);assertPrintableMesh(modelMeshes(bodies)[0].mesh);expect(JSON.stringify(model)).toBe(before);}finally{disposeBodies(bodies);}
  }
  const descriptor=feature.intent.contours[0],candidate={...descriptor,intent:descriptor,keys:['new']};
  expect(()=>resolveChamfer([candidate,{...candidate,keys:['other']}],feature,new Set())).toThrow(/ambiguous/);
  expect(()=>resolveChamfer([], {...feature,intent:undefined},new Set())).toThrow(/selected edge changed/);
});

test('preflight failures retain valid cached inputs and source changes invalidate the cache',()=>{
  const cache=createModelBuildCache(),base=source(),first=buildModel(recipe(base),{cache});let feature;
  try{feature=topFeature(first.get('box').shape);}finally{disposeBodies(first);}
  try{
    expect(()=>buildModel(recipe(base,{...feature,amount:100}),{cache})).toThrow(/wall height/);
    const next=buildModel(recipe(base,feature),{cache});try{assertPrintableMesh(modelMeshes(next)[0].mesh);}finally{disposeBodies(next);}
    const changed=buildModel(recipe({...base,scale:2}),{cache});try{expect(cad.measureVolume(changed.get('box').shape)).toBeCloseTo(32000,5);}finally{disposeBodies(changed);}
  }finally{cache.dispose();}
});

test('a bevel cannot consume the wall separating its contour from an unselected hole',()=>{
  const box=cad.makeBox([-15,-15,0],[15,15,10]),hole=cad.makeCylinder(.5,12,[14,0,-1]),shape=box.cut(hole),feature=topFeature(shape),before=cad.measureVolume(shape);
  try{
    expect(()=>buildChamfer(shape,{...feature,amount:1},edgeSignature)).toThrow(/neighboring hole/);
    const result=buildChamfer(shape,{...feature,amount:.2},edgeSignature);
    try{assertPrintableMesh(result.shape.mesh());expect(cad.measureVolume(result.shape)).toBeLessThan(before);}finally{result.shape.delete();}
    expect(cad.measureVolume(shape)).toBeCloseTo(before,7);
  }finally{shape.delete();hole.delete();box.delete();}
});

test('portable preparation and contour references are bounded; printable validation rejects holes and reversed facets',()=>{
  const mesh=boxMesh();assertPrintableMesh(mesh);
  assertPrintableSTL(arrayBuffer(binarySTL(mesh)));expect(()=>assertPrintableSTL(arrayBuffer(binarySTL({...mesh,triangles:mesh.triangles.slice(3)})))).toThrow(/watertight/);
  expect(()=>assertPrintableMesh({...mesh,triangles:mesh.triangles.slice(3)})).toThrow(/watertight/);
  const flipped=[...mesh.triangles];[flipped[0],flipped[1]]=[flipped[1],flipped[0]];expect(()=>assertPrintableMesh({...mesh,triangles:flipped})).toThrow(/watertight/);
  const intent={version:1,contours:[{kind:'outside-rim',side:1,bounds:[0,0,1,1,1,1]}]},feature={id:'bevel',name:'Bevel',kind:'chamfer',target:'box',amount:.5,edges:['edge'],intent,cleanupTolerance:.01};
  expect(readModel(recipe(source(),feature)).features[1]).toEqual(feature);
  for(const patch of [{cleanupTolerance:1},{intent:{version:2,contours:[]}},{intent:{version:1,contours:[{...intent.contours[0],bounds:[NaN,0,1,1,1,1]}]}}])expect(validModel(recipe(source(),{...feature,...patch}))).toBe(false);
  expect(smallerChamferSizes(1)).toEqual([.75,.5,.25]);expect(smallerChamferSizes(.0001)).toEqual([]);
});
