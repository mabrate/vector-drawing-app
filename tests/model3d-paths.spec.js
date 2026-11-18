import {test,expect} from '@playwright/test';
import paper from 'paper';
import {drawingPaths} from '../src/model3d-paths.js';
import {MM_PER_PIXEL} from '../src/model3d-data.js';
test.beforeEach(()=>paper.setup(new paper.Size(1000,1000)));

test('drawing path snapshots preserve transformed compound holes and selection without modifying artwork',()=>{
  const ring=new paper.CompoundPath({name:'Ring',fillRule:'evenodd',children:[new paper.Path.Rectangle([0,0,100,80]),new paper.Path.Rectangle([20,20,60,40])]}),square=new paper.Path.Rectangle([150,0,50,50]);
  const group=new paper.Group([ring,square]);group.applyMatrix=false;group.scale(2);group.rotate(23);group.translate([100,200]);
  const before=group.exportJSON(),catalog=drawingPaths(paper,[group],[group]);
  expect(catalog).toHaveLength(2);expect(catalog.every(path=>path.selected)).toBe(true);expect(catalog[0].name).toBe('Ring');expect(catalog[0].profile[0].holes).toHaveLength(1);expect(group.exportJSON()).toBe(before);
  const point=ring.children[0].localToGlobal(ring.children[0].curves[0].point1);const vertices=catalog[0].profile[0].outer.flat();expect(vertices.some(vertex=>Math.abs(vertex[0]-point.x*MM_PER_PIXEL)<1e-6&&Math.abs(vertex[1]+point.y*MM_PER_PIXEL)<1e-6)).toBe(true);
  catalog[0].profile[0].outer[0][0][0]+=10;expect(group.exportJSON()).toBe(before);
});

test('only supplied artwork is enumerated and open paths explain why extrusion is unavailable',()=>{
  new paper.Path.Rectangle([0,0,100,100]); // An unrelated overlay must not leak into the workspace.
  const open=new paper.Path({segments:[[0,0],[10,10]],name:'Open'}),closed=new paper.Path.Rectangle([0,0,10,10]);
  const clipped=new paper.Group({children:[new paper.Path.Rectangle([0,0,10,10])]});clipped.clipped=true;
  const catalog=drawingPaths(paper,[open,closed,clipped],[open]);expect(catalog).toHaveLength(2);expect(catalog[0]).toMatchObject({name:'Open',profile:null,selected:false});expect(catalog[0].error).toMatch(/Close every/);expect(catalog[1].profile).toHaveLength(1);
});

for(const grouped of [false,true])for(const merged of [false,true])test(`a transformed compound reduced to one contour keeps its drawing position (${grouped?'grouped':'ungrouped'}, ${merged?'merged':'single'})`,()=>{
  const path=new paper.CompoundPath({pathData:'M0 -80h80v80H0z'+(merged?' M40 -60h80v80H40z':''),fillColor:'teal',applyMatrix:false});
  path.scale(1.3,.8);path.rotate(23);path.translate([400,500]);
  const root=grouped?new paper.Group({children:[path],applyMatrix:false}):path;
  if(grouped){root.scale(.9,1.2);root.rotate(-15);root.translate([150,200]);}
  const before=root.exportJSON(),world=[];
  for(const child of path.children)for(const segment of child.segments)world.push(child.localToGlobal(segment.point));
  const expected={left:Math.min(...world.map(p=>p.x)),right:Math.max(...world.map(p=>p.x)),top:Math.min(...world.map(p=>p.y)),bottom:Math.max(...world.map(p=>p.y))};
  const catalog=drawingPaths(paper,[root],[root]),profile=catalog[0].profile;
  expect(catalog[0].error).toBe('');expect(profile).toHaveLength(1);
  const points=profile[0].outer.flat(),actual={left:Math.min(...points.map(p=>p[0]))/MM_PER_PIXEL,right:Math.max(...points.map(p=>p[0]))/MM_PER_PIXEL,top:-Math.max(...points.map(p=>p[1]))/MM_PER_PIXEL,bottom:-Math.min(...points.map(p=>p[1]))/MM_PER_PIXEL};
  for(const edge of Object.keys(expected))expect(actual[edge]).toBeCloseTo(expected[edge],6);
  expect(root.exportJSON()).toBe(before);
});
