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
