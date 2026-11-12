import {test,expect} from '@playwright/test';
import initOpenCascade from 'replicad-opencascadejs';
import * as cad from 'replicad';
import paper from 'paper';
import {readFile} from 'node:fs/promises';
import {buildModel,modelMeshes,disposeBodies,edgeSignature} from '../src/model3d-kernel.js';
import {selectionProfiles,validModel} from '../src/model3d-data.js';
import {createEdgeSelectionIndex,edgeSelectionGroup,edgeSelectionChoices} from '../src/model3d-edge-selection.js';

test.beforeAll(async()=>{cad.setOC(await initOpenCascade());paper.setup(new paper.Size(1000,1000));});
const atHeight=(edge,z)=>edge.endpoints.every(point=>Math.abs(point[2]-z)<1e-6);
function meshFor(shape){return modelMeshes(new Map([['body',{id:'body',name:'Body',shape}]]))[0];}

test('one rim pick grabs corners in its plane, while side picks can follow the visible face',()=>{
  const shape=cad.sketchRectangle(30,20).extrude(10);
  try{
    const body=meshFor(shape),index=createEdgeSelectionIndex(body.edges),top=body.edges.edgeGroups.filter(edge=>atHeight(edge,10));
    expect(top).toHaveLength(4);
    for(const seed of top){const chain=edgeSelectionGroup(index,seed.key);expect(new Set(chain.keys)).toEqual(new Set(top.map(edge=>edge.key)));}
    expect(edgeSelectionChoices(index)).toHaveLength(6);expect(edgeSelectionChoices(index,{individual:true})).toHaveLength(12);
    expect(edgeSelectionGroup(index,top[0].key,{individual:true}).keys).toEqual([top[0].key]);
    const upright=body.edges.edgeGroups.find(edge=>!atHeight(edge,0)&&!atHeight(edge,10));
    const side=edgeSelectionGroup(index,upright.key,{normal:[1,0,0]});expect(side.keys).toHaveLength(4);expect(Math.abs(side.plane.normal[0])).toBeCloseTo(1,7);
    expect(edgeSelectionGroup(index,top[0].key,{normal:[1,0,0]}).keys).toHaveLength(4);
    expect(edgeSelectionGroup(index,top[0].key,{normal:[1,0,0]}).plane.normal[2]).toBeCloseTo(1,7);
  }finally{shape.delete();}
});

test('curved contour pieces form complete loops without crossing into a hole or another solid',()=>{
  const outside=new paper.Path.Circle({center:[100,100],radius:60,insert:false}),inside=new paper.Path.Circle({center:[100,100],radius:20,insert:false});
  const ring=new paper.CompoundPath({insert:false,children:[outside,inside],fillRule:'evenodd'});
  const feature={id:'ring',name:'Ring',kind:'extrusion',operation:'new',target:null,height:10,start:0,draft:0,profile:selectionProfiles(paper,[ring])};
  const bodies=buildModel({version:1,features:[feature,{...feature,id:'other',name:'Other'}]});
  try{
    const meshes=modelMeshes(bodies),body=meshes[0],index=createEdgeSelectionIndex(body.edges),top=body.edges.edgeGroups.filter(edge=>atHeight(edge,10));
    expect(top).toHaveLength(8);
    const first=edgeSelectionGroup(index,top[0].key);expect(first.keys).toHaveLength(4);
    const other=top.find(edge=>!first.keys.includes(edge.key)),second=edgeSelectionGroup(index,other.key);expect(second.keys).toHaveLength(4);
    expect(first.keys.some(key=>second.keys.includes(key))).toBe(false);
    expect(first.keys.every(key=>top.some(edge=>edge.key===key))).toBe(true);
    expect(meshes).toHaveLength(2);expect(edgeSelectionChoices(createEdgeSelectionIndex(meshes[1].edges)).length).toBeGreaterThan(0);
  }finally{disposeBodies(bodies);ring.remove();}
});

test('a rim left by an earlier chamfer groups in its level plane without an adjacent horizontal face',()=>{
  const shape=cad.sketchRectangle(30,20).extrude(10);let chamfered;
  try{
    const top=new Set(meshFor(shape).edges.edgeGroups.filter(edge=>atHeight(edge,10)).map(edge=>edge.key));
    chamfered=shape.chamfer(edge=>top.has(edgeSignature(edge))?1:null);
    const body=meshFor(chamfered),rim=body.edges.edgeGroups.filter(edge=>atHeight(edge,9));expect(rim).toHaveLength(4);
    const chain=edgeSelectionGroup(createEdgeSelectionIndex(body.edges),rim[0].key);
    expect(new Set(chain.keys)).toEqual(new Set(rim.map(edge=>edge.key)));expect(chain.plane.normal[2]).toBeCloseTo(1,7);
  }finally{chamfered?.delete();shape.delete();}
});

test('a junction chain stays separate from the outside rim in the same plane and chamfers as one contour',async()=>{
  const svg=await readFile(new URL('../examples/stepped-block-3d.svg',import.meta.url),'utf8');
  const recipe=JSON.parse(svg.match(/<metadata[^>]*>(.*?)<\/metadata>/s)[1]);
  const expected=new Set(recipe.features.pop().edges),bodies=buildModel(recipe);
  let chain;
  try{
    const body=modelMeshes(bodies)[0],index=createEdgeSelectionIndex(body.edges);
    chain=edgeSelectionGroup(index,[...expected][0]);expect(new Set(chain.keys)).toEqual(expected);
    const outside=body.edges.edgeGroups.find(edge=>atHeight(edge,3)&&!expected.has(edge.key));
    expect(edgeSelectionGroup(index,outside.key).keys.some(key=>expected.has(key))).toBe(false);
  }finally{disposeBodies(bodies);}
  recipe.features.push({id:'all-junction',name:'Connected chamfer',kind:'chamfer',target:'base',amount:1,edges:chain.keys});
  const treated=buildModel(recipe);try{expect(cad.measureVolume(treated.get('base').shape)).toBeCloseTo(6031.333333,4);}finally{disposeBodies(treated);}
});

test('large split contours keep their full edge list and remain valid portable treatments',()=>{
  const count=300,points=Array.from({length:count},(_,i)=>[20+10*Math.cos(i*2*Math.PI/count),20+10*Math.sin(i*2*Math.PI/count)]);
  const outer=points.map((point,i)=>[point,point,points[(i+1)%count],points[(i+1)%count]]);
  const recipe={version:1,features:[{id:'many',name:'Many segments',kind:'extrusion',operation:'new',target:null,height:5,start:0,draft:0,profile:[{outer,holes:[]}]}]};
  const bodies=buildModel(recipe);
  try{
    const body=modelMeshes(bodies)[0],seed=body.edges.edgeGroups.find(edge=>atHeight(edge,5)),chain=edgeSelectionGroup(createEdgeSelectionIndex(body.edges),seed.key);
    expect(chain.keys).toHaveLength(count);
    recipe.features.push({id:'treatment',name:'Full rim',kind:'chamfer',target:'many',amount:.1,edges:chain.keys});expect(validModel(recipe)).toBe(true);
  }finally{disposeBodies(bodies);}
});

test('connectivity tolerates CAD vertex rounding without following a different plane',()=>{
  const planes=[{normal:[0,0,1],offset:0},{normal:[0,1,0],offset:0}];
  const edgeGroups=[
    {key:'first',endpoints:[[0,0,0],[1.0000099,0,0]],planeIds:[0,1]},
    {key:'second',endpoints:[[1.0000101,0,0],[2,1,0]],planeIds:[0]},
    {key:'upright',endpoints:[[0,0,0],[0,0,1]],planeIds:[1]},
    {key:'disconnected',endpoints:[[2,2,0],[3,3,0]],planeIds:[0]},
  ];
  const index=createEdgeSelectionIndex({edgeGroups,planes});expect(new Set(edgeSelectionGroup(index,'first').keys)).toEqual(new Set(['first','second']));
  expect(edgeSelectionGroup(index,'missing')).toBeNull();
});
