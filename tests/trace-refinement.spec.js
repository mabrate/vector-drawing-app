import {test,expect} from '@playwright/test';
import {createTraceRefinement} from '../src/trace-refinement.js';
test('spot removal affects only the chosen connected shape',()=>{
  const r=createTraceRefinement(8,4),selection=new Uint8Array(32);for(const i of [9,10,17,18,13,14,21,22])selection[i]=1;
  expect(r.removeSpot(1,1,selection,8,4)).toBe(true);for(const i of [9,10,17,18])expect(r.mask[i]).toBe(2);for(const i of [13,14,21,22])expect(r.mask[i]).toBe(0);
  expect(r.removeSpot(0,0,selection,8,4)).toBe(false);
});
test('correction brushes erase marks and sample consistently across trace resolutions',()=>{
  const r=createTraceRefinement(100,100);r.brush(50,50,10,1);r.brush(10,10,5,2);
  expect(r.sample(50,50)[25*50+25]).toBe(1);expect(r.sample(25,25)[2*25+2]).toBe(2);
  r.brush(50,50,10,0);expect(r.mask[5050]).toBe(0);expect(r.mask[1010]).toBe(2);
});
