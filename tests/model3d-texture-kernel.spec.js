import {test,expect} from '@playwright/test';
import initOpenCascade from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {buildModel,modelMeshes,disposeBodies,exportModel,faceSignature} from '../src/model3d-kernel.js';
import {validModel} from '../src/model3d-data.js';
import {textureSolid} from '../src/model3d-texture.js';
import {readSTL} from '../src/model3d-stl.js';
import {boxMesh} from './helpers/model3d-stl.js';
test.beforeAll(async()=>cad.setOC(await initOpenCascade()));
const source={id:'box',name:'Box STL',kind:'stl',operation:'new',target:null,scale:1,mesh:boxMesh()};
const recipe=features=>({version:1,features});
const texture=(faces,rest={})=>({id:'texture',name:'Printable texture',kind:'texture',target:'box',faces,pattern:'ribs',mode:'raised',depth:.5,width:1,spacing:5,angle:0,...rest});
function check(shape){const analyzer=new (cad.getOC()).BRepCheck_Analyzer(shape.wrapped);try{expect(analyzer.IsValid()).toBe(true);}finally{analyzer.delete();}}
function cap(height,bodies){return modelMeshes(bodies)[0].faces.find(face=>face.label.endsWith(`Z ${height} mm`)).key;}

test('raised and engraved ribs, round patterns and square patterns change actual solid volume',async()=>{
  let bodies=buildModel(recipe([source])),top;try{top=cap(10,bodies);}finally{disposeBodies(bodies);}
  for(const [pattern,change] of [['ribs',40],['dots',2*Math.PI],['squares',8]])for(const mode of ['raised','engraved']){
    bodies=buildModel(recipe([source,texture([top],{pattern,mode})]));
    try{
      const shape=bodies.get('box').shape;check(shape);expect(cad.measureVolume(shape)).toBeCloseTo(4000+(mode==='raised'?change:-change),5);
      const stl=exportModel(bodies,'stl');expect(readSTL(await stl.arrayBuffer()).triangles.length).toBeGreaterThan(36);expect(exportModel(bodies,'step').size).toBeGreaterThan(100);
    }finally{disposeBodies(bodies);}
  }
});

test('different patterns can be assigned to different faces and opposite normals point outward',()=>{
  let bodies=buildModel(recipe([source])),top,bottom;
  try{top=cap(10,bodies);bottom=cap(0,bodies);}finally{disposeBodies(bodies);}
  bodies=buildModel(recipe([source,texture([top]),texture([bottom],{id:'second',pattern:'dots',mode:'engraved'})]));
  try{const shape=bodies.get('box').shape;check(shape);expect(cad.measureVolume(shape)).toBeCloseTo(4040-2*Math.PI,5);}finally{disposeBodies(bodies);}
  bodies=buildModel(recipe([source,texture([top,bottom])]));
  try{const shape=bodies.get('box').shape,box=shape.boundingBox;check(shape);expect(cad.measureVolume(shape)).toBeCloseTo(4080,5);try{expect(box.bounds[0][2]).toBeCloseTo(-.5,5);expect(box.bounds[1][2]).toBeCloseTo(10.5,5);}finally{box.delete();}}finally{disposeBodies(bodies);}
});

test('textures follow rotated planar surfaces and clip around holes without filling them',()=>{
  const box=cad.makeBox([0,0,0],[20,20,10]),hole=cad.makeCylinder(4,10,[10,10,0]),plate=box.cut(hole),rotated=box.clone().rotate(27,[0,0,0],[0,1,0]);
  for(const shape of [plate,rotated]){
    const faces=shape.faces;let result;
    try{const selected=faces.filter(face=>face.geomType==='PLANE').sort((a,b)=>{const ac=a.center,bc=b.center;try{return bc.z-ac.z;}finally{ac.delete();bc.delete();}})[0];result=textureSolid(shape,texture([faceSignature(selected)],{pattern:'dots',angle:27}),faceSignature);check(result);expect(cad.measureVolume(result)).toBeGreaterThan(cad.measureVolume(shape));
      if(shape===plate){const probe=cad.makeCylinder(2,20,[10,10,0]),common=result.intersect(probe);try{expect(Math.abs(cad.measureVolume(common))).toBeLessThan(1e-5);}finally{common.delete();probe.delete();}}
    }finally{result?.delete();faces.forEach(face=>face.delete());}
  }
  rotated.delete();plate.delete();hole.delete();box.delete();
});

test('invalid texture inputs, dense patterns, stale faces and curved faces fail explicitly',()=>{
  const bodies=buildModel(recipe([source]));let top;try{top=cap(10,bodies);}finally{disposeBodies(bodies);}
  const feature=texture([top]);
  for(const patch of [{faces:[]},{faces:[top,top]},{pattern:'image'},{mode:'paint'},{depth:0},{spacing:NaN},{width:5},{angle:181},{target:'missing'}])expect(validModel(recipe([source,{...feature,...patch}]))).toBe(false);
  expect(()=>buildModel(recipe([source,{...feature,pattern:'dots',spacing:.1,width:.05}]))).toThrow(/256/);
  expect(()=>buildModel(recipe([source,{...feature,faces:['changed-face']}]))).toThrow(/face changed/);
  const cylinder=cad.makeCylinder(10,10),faces=cylinder.faces;try{const curved=faces.find(face=>face.geomType!=='PLANE');expect(curved).toBeTruthy();expect(()=>textureSolid(cylinder,texture([faceSignature(curved)]),faceSignature)).toThrow(/flat faces/);}finally{faces.forEach(face=>face.delete());cylinder.delete();}
});
