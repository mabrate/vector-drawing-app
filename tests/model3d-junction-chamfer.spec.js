import {test,expect} from '@playwright/test';
import initOpenCascade from 'replicad-opencascadejs';
import * as cad from 'replicad';
import {topology} from '../src/model3d-topology.js';
import {readSTL} from '../src/model3d-stl.js';
import {buildModel,modelMeshes,disposeBodies,exportModel,edgeSignature} from '../src/model3d-kernel.js';
import {planarChamfer,PLANAR_CHAMFER_TOLERANCE} from '../src/planar-chamfer.js';
import {createEdgeSelectionIndex,edgeSelectionGroup} from '../src/model3d-edge-selection.js';
import {closedBinarySTL} from './helpers/model3d-stl.js';

test.setTimeout(120000);
test.beforeAll(async()=>cad.setOC(await initOpenCascade()));

test('hashed topology keeps CAD identity, ordering and hash collisions correct',()=>{
  const shape=cad.makeCylinder(10,5),hasher=cad.getOC().ReplicadShapeHasher,original=hasher.HashCode;
  try{
    for(const kind of ['edge','face']){
      const expected=shape[`${kind}s`],actual=topology(shape,kind);
      try{expect(actual.length).toBe(expected.length);expect(actual.every((item,i)=>item.isSame(expected[i]))).toBe(true);}finally{[...expected,...actual].forEach(item=>item.delete());}
    }
    // Force collisions: a hash bucket must never combine different edges.
    hasher.HashCode=()=>1;
    const expected=shape.edges,actual=topology(shape,'edge');
    try{expect(actual.length).toBe(expected.length);expect(actual.every((item,i)=>item.isSame(expected[i]))).toBe(true);}finally{[...expected,...actual].forEach(item=>item.delete());}
  }finally{hasher.HashCode=original;shape.delete();}
});

async function stamp(){
  // A ring-shaped raised design, a base and a separate through hole. A tiny
  // near-collinear facet reproduces the fragile junction found in real STLs.
  const points=Array.from({length:96},(_,i)=>{const t=i*2*Math.PI/96,r=10+Math.sin(t*3);return [r*Math.cos(t),r*Math.sin(t),3];});
  points.splice(1,0,points[0].map((n,i)=>n+(points[1][i]-n)*.001));points[1][0]+=.00002;
  const face=cad.makePolygon(points),vector=new cad.Vector([0,0,5]),pillar=cad.basicFaceExtrusion(face,vector),base=cad.makeCylinder(18,3),center=cad.makeCylinder(5,10,[0,0,-1]),hole=cad.makeCylinder(1,5,[15,0,-1]);
  const joined=base.fuse(pillar),ring=joined.cut(center),shape=ring.cut(hole);
  try{return {id:'stamp',name:'Imported stamp',kind:'stl',operation:'new',target:null,scale:1,mesh:readSTL(await shape.blobSTL({binary:true,tolerance:.05,angularTolerance:.25}).arrayBuffer())};}
  finally{[shape,ring,joined,hole,center,base,pillar,vector,face].forEach(item=>item.delete());}
}

test('a dense imported junction accepts a 1 mm bevel, preserves holes and exports a closed STL',async()=>{
  const source=await stamp(),recipe={version:1,features:[source]},before=JSON.stringify(source),initial=buildModel(recipe);let keys,volume,segments;
  try{
    const body=modelMeshes(initial)[0];volume=body.volume;
    const edge=body.edges.edgeGroups.find(edge=>edge.endpoints.every(p=>Math.abs(p[2]-3)<1e-5)&&Math.hypot(...edge.endpoints[0].slice(0,2))>8&&Math.hypot(...edge.endpoints[0].slice(0,2))<12);
    keys=edgeSelectionGroup(createEdgeSelectionIndex(body.edges),edge.key).keys;expect(keys.length).toBeGreaterThan(90);
    segments=body.edges.edgeGroups.filter(edge=>keys.includes(edge.key)).map(edge=>edge.endpoints);
  }finally{disposeBodies(initial);}
  recipe.features.push({id:'bevel',name:'Junction bevel',kind:'chamfer',target:'stamp',amount:1,edges:keys});
  const bodies=buildModel(recipe);
  try{
    const shape=bodies.get('stamp').shape,checker=new (cad.getOC()).BRepCheck_Analyzer(shape.wrapped);
    try{expect(checker.IsValid()).toBe(true);}finally{checker.delete();}
    const body=modelMeshes(bodies)[0];expect(body.planarBevelTolerance).toBe(PLANAR_CHAMFER_TOLERANCE);expect(body.volume).toBeGreaterThan(volume+25);expect(body.volume).toBeLessThan(volume+50);
    for(const [r,at] of [[4,[0,0,-1]],[.8,[15,0,-1]]]){
      const probe=cad.makeCylinder(r,12,at),common=shape.intersect(probe);
      try{expect(Math.abs(cad.measureVolume(common))).toBeLessThan(1e-6);}finally{common.delete();probe.delete();}
    }
    const bytes=Buffer.from(await exportModel(bodies,'stl').arrayBuffer());expect(closedBinarySTL(bytes)).toBe(true);
    let samples=0,maxError=0;
    for(let i=0;i<bytes.readUInt32LE(80);i++){
      const start=84+i*50,nz=bytes.readFloatLE(start+8);if(nz<.1||nz>.95)continue;
      const triangle=[0,1,2].map(v=>[0,1,2].map(a=>bytes.readFloatLE(start+12+v*12+a*4))),p=[0,1,2].map(a=>triangle.reduce((s,p)=>s+p[a],0)/3);
      if(p[2]<3.005||p[2]>3.995)continue;
      const distance=Math.min(...segments.map(([a,b])=>{const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}));
      maxError=Math.max(maxError,Math.abs(distance-(4-p[2])));samples++;
    }
    expect(samples).toBeGreaterThan(90);expect(maxError).toBeLessThanOrEqual(PLANAR_CHAMFER_TOLERANCE);
    expect(await exportModel(bodies,'step').text()).toContain('ISO-10303-21');expect(JSON.stringify(source)).toBe(before);
  }finally{disposeBodies(bodies);}
});

test('a junction bevel fits its wall height and retains the input on failure',()=>{
  const base=cad.makeBox([-15,-15,0],[15,15,3]),pillar=cad.makeBox([-5,-5,3],[5,5,8]),shape=base.fuse(pillar);let result;
  try{
    const edges=topology(shape,'edge'),keys=new Set();
    try{for(const edge of edges){const a=edge.startPoint,b=edge.endPoint;try{if(Math.abs(a.z-3)<1e-7&&Math.abs(b.z-3)<1e-7&&Math.max(Math.abs(a.x),Math.abs(a.y),Math.abs(b.x),Math.abs(b.y))<6)keys.add(edgeSignature(edge));}finally{a.delete();b.delete();}}}finally{edges.forEach(edge=>edge.delete());}
    result=planarChamfer(shape,keys,1,edgeSignature);expect(cad.measureVolume(result)).toBeCloseTo(3220.666667,0);
    // Along a straight wall the 45-degree section obeys x + z = 9.
    // Probe both sides of it, away from the overlap used for solid booleans.
    for(const [x,z,inside] of [[5.2,3.5,true],[5.7,3.5,false],[5.05,4.1,false]]){
      const probe=cad.makeBox([x,-.02,z],[x+.02,.02,z+.02]),common=result.intersect(probe);
      try{expect(cad.measureVolume(common)).toBeCloseTo(inside ? .000016 : 0,8);}finally{common.delete();probe.delete();}
    }
    expect(()=>planarChamfer(shape,keys,6,edgeSignature)).toThrow(/adjacent vertical walls/);expect(cad.measureVolume(shape)).toBeCloseTo(3200,6);
    expect(()=>planarChamfer(shape,new Set([...keys].slice(1)),1,edgeSignature)).toThrow(/complete upper outside rim/);
  }finally{result?.delete();[shape,pillar,base].forEach(item=>item.delete());}
});
