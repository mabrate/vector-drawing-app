import {test,expect} from '@playwright/test';
import initOpenCascade from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {readSTL,validSTLMesh,meshComponents,MAX_STL_TRIANGLES} from '../src/model3d-stl.js';
import {buildModel,modelMeshes,disposeBodies,exportModel} from '../src/model3d-kernel.js';
import {validModel,withoutFeature,readModel} from '../src/model3d-data.js';
import {boxMesh,binarySTL,asciiSTL,arrayBuffer,combineMeshes} from './helpers/model3d-stl.js';
test.beforeAll(async()=>cad.setOC(await initOpenCascade()));
const imported=(mesh=boxMesh(),scale=1)=>({id:'import',name:'Imported STL',kind:'stl',operation:'new',target:null,mesh,scale});
const model=features=>({version:1,features});
function valid(shape){const check=new (cad.getOC()).BRepCheck_Analyzer(shape.wrapped);try{expect(check.IsValid()).toBe(true);}finally{check.delete();}}

test('binary and ASCII STL become solid faces without triangle diagonals and accept a rim chamfer',()=>{
  for(const buffer of [binarySTL(),binarySTL(boxMesh(),'solid binary header'),asciiSTL()]){
    const source=imported(readSTL(arrayBuffer(buffer)));let bodies=buildModel(model([source])),keys;
    try{const data=modelMeshes(bodies)[0];expect(data.volume).toBeCloseTo(4000,5);expect(data.faces).toHaveLength(6);expect(data.edges.edgeGroups).toHaveLength(12);keys=data.edges.edgeGroups.filter(edge=>edge.endpoints.every(point=>Math.abs(point[2]-10)<1e-6)).map(edge=>edge.key);expect(keys).toHaveLength(4);}finally{disposeBodies(bodies);}
    const feature={id:'bevel',name:'Chamfer',kind:'chamfer',target:'import',amount:.5,edges:keys};bodies=buildModel(model([source,feature]));
    try{const shape=bodies.get('import').shape;valid(shape);expect(cad.measureVolume(shape)).toBeCloseTo(3990.1666666667,5);for(const format of ['stl','step'])expect(exportModel(bodies,format).size).toBeGreaterThan(100);}finally{disposeBodies(bodies);}
    expect(withoutFeature(model([source,feature]),'import').features).toEqual([]);expect(()=>readModel(model([source,feature]))).not.toThrow();
  }
});

test('faceted cylindrical STL supports its complete upper rim without internal cap triangle edges',async()=>{
  const cylinder=cad.makeCylinder(10,10);let source;
  try{source=imported(readSTL(await cylinder.blobSTL({binary:true,tolerance:.1,angularTolerance:.4}).arrayBuffer()));}finally{cylinder.delete();}
  let bodies=buildModel(model([source])),keys,volume;
  try{const data=modelMeshes(bodies)[0];volume=data.volume;keys=data.edges.edgeGroups.filter(edge=>edge.endpoints.every(point=>Math.abs(point[2]-10)<1e-5)).map(edge=>edge.key);expect(keys.length).toBeGreaterThan(8);}finally{disposeBodies(bodies);}
  bodies=buildModel(model([source,{id:'bevel',name:'Rim chamfer',kind:'chamfer',target:'import',amount:.5,edges:keys}]));
  try{valid(bodies.get('import').shape);expect(cad.measureVolume(bodies.get('import').shape)).toBeLessThan(volume);expect(exportModel(bodies,'stl').size).toBeGreaterThan(100);}finally{disposeBodies(bodies);}
});

test('STL units, disconnected parts and nested void shells preserve physical volumes',()=>{
  for(const [mesh,scale,volume] of [[boxMesh(),25.4,4000*25.4**3],[combineMeshes([boxMesh(),boxMesh(10,10,10,[30,0,0])]),1,5000],[combineMeshes([boxMesh(),boxMesh(10,10,4,[5,5,3])]),1,3600]]){
    const bodies=buildModel(model([imported(mesh,scale)]));
    try{valid(bodies.get('import').shape);expect(cad.measureVolume(bodies.get('import').shape)).toBeCloseTo(volume,4);}finally{disposeBodies(bodies);}
  }
});

test('a triangulated tube keeps its through hole after sewing and coplanar merging',async()=>{
  const outer=cad.makeCylinder(10,10),inner=cad.makeCylinder(5,10),tube=outer.cut(inner);let source;
  try{source=imported(readSTL(await tube.blobSTL({binary:true,tolerance:.1,angularTolerance:.4}).arrayBuffer()));}finally{tube.delete();inner.delete();outer.delete();}
  const bodies=buildModel(model([source]));
  try{
    const shape=bodies.get('import').shape,probe=cad.makeCylinder(2,12,[0,0,-1]),common=shape.intersect(probe);valid(shape);
    try{expect(Math.abs(cad.measureVolume(common))).toBeLessThan(1e-5);}finally{common.delete();probe.delete();}
    const data=modelMeshes(bodies)[0];expect(data.volume).toBeGreaterThan(2300);expect(data.volume).toBeLessThan(2400);
    const planes=data.faces.filter(face=>face.label.includes(' · Z '));expect(planes).toHaveLength(2);
  }finally{disposeBodies(bodies);}
});

test('malformed, open, non-manifold and oversized meshes are rejected before CAD work',()=>{
  const original=boxMesh();expect(validSTLMesh(original)).toBe(true);
  const missing={...original,triangles:original.triangles.slice(3)};expect(()=>meshComponents(missing)).toThrow(/closed and manifold/);
  expect(()=>readSTL(arrayBuffer(binarySTL(missing)))).toThrow(/closed and manifold/);
  const bad=binarySTL();bad.writeFloatLE(NaN,96);expect(()=>readSTL(arrayBuffer(bad))).toThrow(/invalid coordinates/);
  expect(()=>readSTL(arrayBuffer(Buffer.from('solid bad\nfacet normal 0 0 0\nfacet normal 0 0 0\n')))).toThrow(/incomplete/);
  const big=Buffer.alloc(84+(MAX_STL_TRIANGLES+1)*50);big.writeUInt32LE(MAX_STL_TRIANGLES+1,80);expect(()=>readSTL(arrayBuffer(big))).toThrow(/10,000/);
  for(const patch of [{scale:0},{scale:Infinity},{mesh:{...original,triangles:[0,1,2,999]}},{mesh:{...original,vertices:[NaN,...original.vertices.slice(1)]}},{target:'other'}])expect(validModel(model([{...imported(),...patch}]))).toBe(false);
  const mixed={...original,triangles:original.triangles.map((value,index)=>index<3?original.triangles[2-index]:value)};expect(meshComponents(mixed)).toHaveLength(1);
});
