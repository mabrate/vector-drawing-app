import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import initOpenCascade from 'replicad-opencascadejs';
import * as cad from 'replicad';
import paper from 'paper';
import {buildModel,modelMeshes,disposeBodies,exportModel,edgeSignature} from '../src/model3d-kernel.js';
import {planarChamfer,bevelRoof,PLANAR_CHAMFER_TOLERANCE} from '../src/planar-chamfer.js';
import {createEdgeSelectionIndex,edgeSelectionGroup} from '../src/model3d-edge-selection.js';

test.setTimeout(180000);
test.beforeAll(async()=>{cad.setOC(await initOpenCascade());paper.setup(new paper.Size(500,500));});

test('a planar bevel roof preserves its boundary and has no interior mesh cracks',()=>{
  const roof=bevelRoof([[0,0],[40,0],[40,30],[0,30]],[[1,1],[1,29],[39,29],[39,1]],1),edges=new Map();
  for(const tri of roof.triangles)for(let i=0;i<3;i++){const key=[tri[i],tri[(i+1)%3]].sort((a,b)=>a-b).join(',');edges.set(key,(edges.get(key)||0)+1);}
  expect([...edges.values()].every(n=>n===1||n===2)).toBe(true);expect([...edges.values()].filter(n=>n===1)).toHaveLength(8);
  for(const tri of roof.triangles){const center=[0,1].map(j=>tri.reduce((sum,i)=>sum+roof.vertices[i].p[j],0)/3),h=tri.reduce((sum,i)=>sum+roof.vertices[i].h,0)/3;expect(Math.abs(Math.min(1,center[0],40-center[0],center[1],30-center[1])-h)).toBeLessThanOrEqual(PLANAR_CHAMFER_TOLERANCE);}
});

test('the fish receives the requested 1 mm bevel across 71 original pieces and exports a closed printable solid',async()=>{
  const model=JSON.parse(await readFile(new URL('./fixtures/fish-chamfer.json',import.meta.url),'utf8')),before=JSON.stringify(model);
  expect(Math.min(...model.features[0].profile[0].outer.map(c=>Math.hypot(c[3][0]-c[0][0],c[3][1]-c[0][1])))).toBeLessThan(.005);
  expect(()=>buildModel(model,{planarFallback:false})).toThrow();
  const bodies=buildModel(model);
  try{
    const shape=bodies.get('fish').shape,checker=new (cad.getOC()).BRepCheck_Analyzer(shape.wrapped);
    expect(checker.IsValid()).toBe(true);checker.delete();expect(cad.measureVolume(shape)).toBeCloseTo(9070.47,0);expect(JSON.stringify(model)).toBe(before);
    const meshes=modelMeshes(bodies);expect(meshes[0].planarBevelTolerance).toBe(PLANAR_CHAMFER_TOLERANCE);
    const index=createEdgeSelectionIndex(meshes[0].edges),top=meshes[0].edges.edgeGroups.find(edge=>edge.endpoints.every(p=>Math.abs(p[2]-10)<1e-6)&&edgeSelectionGroup(index,edge.key)?.keys.length>100);
    expect(top).toBeTruthy();expect(edgeSelectionGroup(index,top.key).keys.length).toBeGreaterThan(100);
    const blob=exportModel(bodies,'stl'),bytes=Buffer.from(await blob.arrayBuffer()),count=bytes.readUInt32LE(80),edges=new Map();
    const wire=model.features[0].profile[0].outer,path=new paper.Path({insert:false,closed:true,segments:wire.map((c,i)=>new paper.Segment(c[0],new paper.Point(wire[(i+wire.length-1)%wire.length][2]).subtract(c[0]),new paper.Point(c[1]).subtract(c[0])))});
    let samples=0,maxError=0;
    try{for(let t=0;t<count;t++){
      const base=84+t*50,nz=bytes.readFloatLE(base+8),points=[0,1,2].map(i=>[0,1,2].map(j=>bytes.readFloatLE(base+12+i*12+j*4))),keys=points.map(p=>p.map(n=>Math.round(n*1e5)).join(','));
      expect(new Set(keys).size).toBe(3);
      for(let i=0;i<3;i++){const key=[keys[i],keys[(i+1)%3]].sort().join('|');edges.set(key,(edges.get(key)||0)+1);}
      const p=[0,1,2].map(j=>points.reduce((sum,p)=>sum+p[j],0)/3);
      if(p[2]>9.005&&p[2]<9.995&&nz>.1&&nz<.999){const point=new paper.Point(p[0],p[1]);maxError=Math.max(maxError,Math.abs(path.getNearestPoint(point).getDistance(point)-(p[2]-9)));samples++;}
    }}finally{path.remove();}
    expect([...edges.values()].every(n=>n===2)).toBe(true);expect(samples).toBeGreaterThan(100);expect(maxError).toBeLessThanOrEqual(PLANAR_CHAMFER_TOLERANCE);
    expect(await exportModel(bodies,'step').text()).toContain('ISO-10303-21');
  }finally{disposeBodies(bodies);}
});

test('the fallback refuses partial rims and bevels reaching below a vertical wall',()=>{
  const shape=cad.sketchRectangle(30,20).extrude(5);
  try{const mesh=modelMeshes(new Map([['box',{id:'box',name:'Box',shape}]]))[0],top=mesh.edges.edgeGroups.filter(e=>e.endpoints.every(p=>Math.abs(p[2]-5)<1e-6));
    expect(()=>planarChamfer(shape,new Set([top[0].key]),1,edgeSignature)).toThrow(/complete upper outside rim/);
    expect(()=>planarChamfer(shape,new Set(top.map(e=>e.key)),6,edgeSignature)).toThrow(/adjacent vertical walls/);
    expect(cad.measureVolume(shape)).toBeCloseTo(3000,5);
  }finally{shape.delete();}
});
