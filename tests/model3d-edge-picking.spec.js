import {test,expect} from '@playwright/test';
import {screenEdgeCandidates} from '../src/model3d-edge-picking.js';

const segment=(key,y,depth=.5,boundary=false)=>({body:'body',key,boundary,a:{x:0,y,z:depth,w:1},b:{x:100,y,z:depth,w:1}});
test('picking ranks screen distance, snaps to nearby complete boundaries, and uses depth for overlap',()=>{
  const point={x:50,y:0},pieces=[segment('front-side',1,.1),segment('rim',3,.8,true)];
  expect(screenEdgeCandidates(pieces,point)[0].key).toBe('rim');
  expect(screenEdgeCandidates(pieces,point,{preferBoundaries:false})[0].key).toBe('front-side');
  expect(screenEdgeCandidates([segment('back',0,.9,true),segment('front',0,.2,true)],point)[0].key).toBe('front');
  expect(screenEdgeCandidates([segment('near',2,.9),segment('far',9,.1)],point)[0].key).toBe('near');
});
test('touch has a generous CSS pixel radius, repeated segments are deduplicated, and clipped edges are ignored',()=>{
  const point={x:50,y:0};expect(screenEdgeCandidates([segment('rim',20)],point)).toEqual([]);
  expect(screenEdgeCandidates([segment('rim',20)],point,{radius:24})).toHaveLength(1);
  const hidden=segment('behind',0);hidden.a.w=hidden.b.w=-1;
  expect(screenEdgeCandidates([hidden,segment('rim',4),segment('rim',2),segment('beyond',0,2)],point)).toHaveLength(1);
  expect(screenEdgeCandidates([segment('rim',4),segment('rim',2)],point)[0].distance).toBe(2);
});
test('visibility checks receive perspective-correct positions on slanted edges',()=>{
  const slanted=segment('slanted',0);slanted.b.w=3;
  expect(screenEdgeCandidates([slanted],{x:50,y:0})[0].u).toBeCloseTo(.25,8);
});
