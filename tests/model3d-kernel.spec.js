import {test,expect} from '@playwright/test';
import initOpenCascade from 'replicad-opencascadejs';
import * as cad from 'replicad';
import paper from 'paper';
import {buildModel,modelMeshes,disposeBodies,exportModel,edgeSignature} from '../src/model3d-kernel.js';
import {selectionProfiles,validModel,withoutFeature,MM_PER_PIXEL} from '../src/model3d-data.js';

const wire=points=>points.map((point,i)=>[point,point,points[(i+1)%points.length],points[(i+1)%points.length]]);
const rect=(x,y,w,h)=>({outer:wire([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]),holes:[]});
const extrusion=(id,profile,height,rest={})=>({id,name:id,kind:'extrusion',operation:'new',target:null,profile:[profile],height,start:0,draft:0,...rest});
const model=features=>({version:1,features});
test.beforeAll(async()=>{cad.setOC(await initOpenCascade());paper.setup(new paper.Size(1000,1000));});

test('true solids preserve millimeters, holes, curves and draft angle',()=>{
  const profile=rect(0,0,40,30);profile.holes.push(wire([[10,10],[10,20],[20,20],[20,10]]));
  let bodies=buildModel(model([extrusion('plate',profile,5,{start:7})]));
  try{expect(cad.measureVolume(bodies.get('plate').shape)).toBeCloseTo(5500,5);const box=bodies.get('plate').shape.boundingBox;expect(box.bounds[0][2]).toBeCloseTo(7,6);expect(box.bounds[1][2]).toBeCloseTo(12,6);box.delete();}finally{disposeBodies(bodies);}
  bodies=buildModel(model([extrusion('draft',rect(0,0,40,30),10,{draft:5})]));
  try{const offset=10*Math.tan(5*Math.PI/180),expected=40*30*10-(40+30)*10*offset+4/3*10*offset**2;expect(cad.measureVolume(bodies.get('draft').shape)).toBeCloseTo(expected,4);}finally{disposeBodies(bodies);}
  const circle=new paper.Path.Circle({center:[200,200],radius:60,insert:false});
  bodies=buildModel(model([extrusion('curves',selectionProfiles(paper,[circle])[0],8)]));
  try{expect(cad.measureVolume(bodies.get('curves').shape)).toBeCloseTo(Math.abs(circle.area)*MM_PER_PIXEL**2*8,1);}finally{disposeBodies(bodies);circle.remove();}
});

test('20 mm circular profiles draft to valid cones in either direction without changing their recipe',async()=>{
  const circle=new paper.Path.Circle({center:[200,240],radius:10/MM_PER_PIXEL,insert:false});
  circle.rotate(23);circle.reverse();
  const profile=selectionProfiles(paper,[circle])[0],before=JSON.stringify(profile);
  const height=10,frustum=(radius,offset)=>Math.PI*height/3*(radius**2+radius*(radius-offset)+(radius-offset)**2);
  try{
    for(const angle of [5,-5]){
      const bodies=buildModel(model([extrusion('circle',profile,height,{draft:angle,start:7})]));
      try{
        const shape=bodies.get('circle').shape,checker=new (cad.getOC()).BRepCheck_Analyzer(shape.wrapped);
        try{expect(checker.IsValid()).toBe(true);}finally{checker.delete();}
        expect(cad.measureVolume(shape)).toBeCloseTo(frustum(10,height*Math.tan(angle*Math.PI/180)),6);
        const faces=shape.faces;try{expect(faces.filter(face=>face.geomType==='CONE')).toHaveLength(1);}finally{faces.forEach(face=>face.delete());}
        const box=shape.boundingBox;try{expect(box.bounds[0][2]).toBeCloseTo(7,5);expect(box.bounds[1][2]).toBeCloseTo(17,5);}finally{box.delete();}
        expect(modelMeshes(bodies)[0].mesh.triangles.length).toBeGreaterThan(24);
        for(const format of ['step','stl'])expect(exportModel(bodies,format).size).toBeGreaterThan(100);
      }finally{disposeBodies(bodies);}
    }
    expect(JSON.stringify(profile)).toBe(before);
    expect(()=>buildModel(model([extrusion('circle',profile,200,{draft:5})]))).toThrow(/draft closes the circular profile/);
    // Unequal scaling makes an ellipse, which must never be replaced by a cone.
    circle.scale(1,1.1);const ellipse=selectionProfiles(paper,[circle])[0];
    expect(()=>buildModel(model([extrusion('ellipse',ellipse,10,{draft:5})]))).toThrow();
  }finally{circle.remove();}
});

test('drafts expand circular holes, support mixed outlines, and reject walls that close at the top',()=>{
  const circle=new paper.Path.Circle({center:[0,0],radius:10/MM_PER_PIXEL,insert:false});
  const outer=selectionProfiles(paper,[circle])[0];circle.scale(.3);
  const hole=selectionProfiles(paper,[circle])[0].outer;circle.remove();
  const height=10,offset=height*Math.tan(5*Math.PI/180);
  const frustum=(radius,d)=>Math.PI*height/3*(radius**2+radius*(radius-d)+(radius-d)**2);
  for(const angle of [5,-5]){
    const bodies=buildModel(model([extrusion('ring',{...outer,holes:[hole]},height,{draft:angle})]));
    try{expect(cad.measureVolume(bodies.get('ring').shape)).toBeCloseTo(frustum(10,Math.sign(angle)*offset)-frustum(3,-Math.sign(angle)*offset),5);}finally{disposeBodies(bodies);}
  }
  const plate=rect(-20,-15,40,30);plate.holes=[hole];
  let bodies=buildModel(model([extrusion('plate',plate,height,{draft:5})]));
  try{expect(cad.measureVolume(bodies.get('plate').shape)).toBeCloseTo(40*30*height-70*height*offset+4/3*height*offset**2-frustum(3,-offset),4);}finally{disposeBodies(bodies);}
  bodies=buildModel(model([extrusion('mixed',{...outer,holes:[rect(-1,-1,2,2).outer]},height,{draft:5})]));
  try{expect(cad.measureVolume(bodies.get('mixed').shape)).toBeCloseTo(frustum(10,offset)-(4*height+4*height*offset+4/3*height*offset**2),4);}finally{disposeBodies(bodies);}
  expect(()=>buildModel(model([extrusion('ring',{...outer,holes:[hole]},50,{draft:5})]))).toThrow(/draft closes the wall/);
  expect(()=>buildModel(model([extrusion('ring',{...outer,holes:[hole]},40,{draft:-5})]))).toThrow(/draft closes a circular hole/);
});

test('unions and cuts produce one connected body and a real junction chamfer',()=>{
  const features=[extrusion('base',rect(0,0,40,30),3),extrusion('boss',rect(10,10,20,10),15,{operation:'join',target:'base'})];
  let bodies=buildModel(model(features));
  let signature;
  try{
    expect(bodies.size).toBe(1);expect(cad.measureVolume(bodies.get('base').shape)).toBeCloseTo(6000,5);
    // This is the internal ledge at z=3, along the boss's front wall.
    const edges=bodies.get('base').shape.edges;
    try{const edge=edges.find(edge=>{const center=edge.pointAt(.5);try{const [x,y,z]=center.toTuple();return Math.abs(x-20)<1e-5&&Math.abs(y-10)<1e-5&&Math.abs(z-3)<1e-5;}finally{center.delete();}});expect(edge).toBeTruthy();signature=edgeSignature(edge);}finally{edges.forEach(edge=>edge.delete());}
  }finally{disposeBodies(bodies);}
  const treatment={id:'chamfer',name:'Junction chamfer',kind:'chamfer',target:'base',amount:1,edges:[signature]};
  bodies=buildModel(model([...features,treatment]));
  try{expect(cad.measureVolume(bodies.get('base').shape)).toBeGreaterThan(6000);expect(modelMeshes(bodies)[0].edges.edgeGroups.length).toBeGreaterThan(24);}finally{disposeBodies(bodies);}
  bodies=buildModel(model([...features,{...treatment,kind:'fillet',name:'Junction fillet',amount:.5}]));
  try{expect(cad.measureVolume(bodies.get('base').shape)).toBeGreaterThan(6000);expect(modelMeshes(bodies)[0].mesh.triangles.length).toBeGreaterThan(36);}finally{disposeBodies(bodies);}
  bodies=buildModel(model([...features,extrusion('hole',rect(15,12,5,5),20,{operation:'cut',target:'base'})]));
  try{expect(cad.measureVolume(bodies.get('base').shape)).toBeCloseTo(5625,4);}finally{disposeBodies(bodies);}
  expect(()=>buildModel(model([...features,{...treatment,edges:['missing-edge']}]))).toThrow(/selected edge changed/);
});

test('exports can be repeated without consuming solids, and separate solids stay separate',async()=>{
  const bodies=buildModel(model([extrusion('a',rect(0,0,10,10),5),extrusion('b',rect(20,0,10,10),5)]));
  try{
    for(const format of ['stl','step','stl']){const blob=exportModel(bodies,format);expect(blob.size).toBeGreaterThan(100);if(format==='step')expect(await blob.text()).toContain('ISO-10303-21');}
    expect(modelMeshes(bodies)).toHaveLength(2);expect(cad.measureVolume(bodies.get('a').shape)).toBeCloseTo(500,5);
  }finally{disposeBodies(bodies);}
});

test('profile conversion respects transforms, evenodd holes, islands and selection boundaries',()=>{
  const path=new paper.CompoundPath({insert:false,fillRule:'evenodd',children:[new paper.Path.Rectangle({from:[0,0],to:[100,100],insert:false}),new paper.Path.Rectangle({from:[20,20],to:[80,80],insert:false}),new paper.Path.Rectangle({from:[40,40],to:[60,60],insert:false})]});
  path.applyMatrix=false;path.scale(2,3);path.rotate(20);path.translate([80,150]);
  const before=path.exportJSON(),profiles=selectionProfiles(paper,[path]);expect(profiles).toHaveLength(2);expect(profiles[0].holes).toHaveLength(1);expect(path.exportJSON()).toEqual(before);
  const bodies=buildModel(model([extrusion('nested',profiles[0],4,{profile:profiles})]));
  try{expect(cad.measureVolume(bodies.get('nested').shape)).toBeCloseTo((10000-3600+400)*6*MM_PER_PIXEL**2*4,3);}finally{disposeBodies(bodies);path.remove();}
  const open=new paper.Path({segments:[[0,0],[100,100]],insert:false});expect(()=>selectionProfiles(paper,[open])).toThrow(/Close every/);open.remove();
});

test('portable recipes reject malformed dimensions and orphaned operations',()=>{
  const base=extrusion('base',rect(0,0,10,10),5),join=extrusion('join',rect(1,1,2,2),10,{operation:'join',target:'base'});
  expect(validModel(model([base,join]))).toBe(true);expect(validModel(model([{...base,height:NaN}]))).toBe(false);expect(validModel(model([join,base]))).toBe(false);
  expect(withoutFeature(model([base,join]),'base').features).toEqual([]);
});

test('shells create cups, tubes and side openings with real inward/outward wall placement',()=>{
  const base=extrusion('box',rect(0,0,40,30),20);
  let bodies=buildModel(model([base])),catalog;
  try{catalog=modelMeshes(bodies)[0].faces;}finally{disposeBodies(bodies);}
  const top=catalog.find(face=>face.label.endsWith('Z 20 mm')).key,bottom=catalog.find(face=>face.label.endsWith('Z 0 mm')).key;
  const shell={id:'shell',name:'Shell',kind:'shell',target:'box',thickness:1,direction:'inside',faces:[top]};
  for(const [faces,volume] of [[[top],24000-38*28*19],[[top,bottom],24000-38*28*20],[[top,catalog[0].key],24000-38*29*19]]){
    bodies=buildModel(model([base,{...shell,faces}]));
    try{
      const shape=bodies.get('box').shape,checker=new (cad.getOC()).BRepCheck_Analyzer(shape.wrapped);
      try{expect(checker.IsValid()).toBe(true);}finally{checker.delete();}
      expect(cad.measureVolume(shape)).toBeCloseTo(volume,5);
      const box=shape.boundingBox;try{expect(box.bounds[0]).toEqual([0,0,0]);expect(box.bounds[1]).toEqual([40,30,20]);}finally{box.delete();}
      expect(modelMeshes(bodies)[0].shellSources.shell).toHaveLength(6);
      for(const format of ['stl','step'])expect(exportModel(bodies,format).size).toBeGreaterThan(100);
    }finally{disposeBodies(bodies);}
  }
  bodies=buildModel(model([base,{...shell,direction:'outside'}]));
  try{
    const shape=bodies.get('box').shape,box=shape.boundingBox;
    try{expect(box.bounds[0]).toEqual([-1,-1,-1]);expect(box.bounds[1]).toEqual([41,31,20]);}finally{box.delete();}
    const original=buildModel(model([base]));
    try{const common=shape.intersect(original.get('box').shape);try{expect(Math.abs(cad.measureVolume(common))).toBeLessThan(1e-5);}finally{common.delete();}}finally{disposeBodies(original);}
  }finally{disposeBodies(bodies);}
  expect(()=>buildModel(model([base,{...shell,thickness:100}]))).toThrow(/thickness/);
  expect(()=>buildModel(model([base,{...shell,faces:['missing-face']}]))).toThrow(/opening face changed/);
  expect(()=>buildModel(model([base,{...shell,faces:catalog.map(face=>face.key)}]))).toThrow(/at least one face/);
  expect(()=>buildModel(model([{...base,height:25},shell]))).toThrow(/opening face changed/);
  for(const patch of [{thickness:0},{thickness:NaN},{thickness:1001},{direction:'both'},{faces:[]},{faces:[top,top]},{target:'absent'},{faces:[null]}])expect(validModel(model([base,{...shell,...patch}]))).toBe(false);
  expect(withoutFeature(model([base,shell]),'box').features).toEqual([]);
});

test('circular extrusions shell into tubes in either direction and reject invalid conical offsets',()=>{
  const circle=new paper.Path.Circle({center:[0,0],radius:10/MM_PER_PIXEL,insert:false});
  const profile=selectionProfiles(paper,[circle])[0];circle.remove();
  for(const draft of [0,5])for(const direction of ['inside','outside']){
    const base=extrusion('cylinder',profile,20,{start:3,draft});let bodies=buildModel(model([base])),caps;
    try{caps=modelMeshes(bodies)[0].faces.filter(face=>face.label.includes(' · Z ')).map(face=>face.key);}finally{disposeBodies(bodies);}
    expect(caps).toHaveLength(2);
    if(draft){expect(()=>buildModel(model([base,{id:'tube',name:'Tube',kind:'shell',target:'cylinder',thickness:1,direction,faces:caps}]))).toThrow(/shell could not be built/);continue;}
    bodies=buildModel(model([base,{id:'tube',name:'Tube',kind:'shell',target:'cylinder',thickness:1,direction,faces:caps}]));
    try{
      const shape=bodies.get('cylinder').shape,checker=new (cad.getOC()).BRepCheck_Analyzer(shape.wrapped);
      try{expect(checker.IsValid()).toBe(true);}finally{checker.delete();}
      if(!draft)expect(cad.measureVolume(shape)).toBeCloseTo(Math.PI*20*(direction==='inside'?100-81:121-100),0);
      const box=shape.boundingBox;try{expect(box.bounds[0][2]).toBeCloseTo(3,5);expect(box.bounds[1][2]).toBeCloseTo(23,5);}finally{box.delete();}
      expect(modelMeshes(bodies)[0].mesh.triangles.length).toBeGreaterThan(30);
      expect(exportModel(bodies,'step').size).toBeGreaterThan(100);
    }finally{disposeBodies(bodies);}
  }
});
