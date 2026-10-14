import {test,expect} from '@playwright/test';
import {createBackgroundSelection} from '../src/background-removal.js';
function pixels(colors){return new Uint8ClampedArray(colors.flatMap(c=>[...c,255]));}
test('smart selection stays contiguous and compares to the seed color',()=>{
  const data=pixels([[255,255,255],[255,0,0],[255,255,255],[255,255,255],[255,0,0],[255,255,255]]);
  const s=createBackgroundSelection(data,3,2);s.flood(0,10);
  expect([...s.mask]).toEqual([1,0,0,1,0,0]);
  const ramp=createBackgroundSelection(pixels([[0,0,0],[20,20,20],[40,40,40],[60,60,60]]),4,1);ramp.flood(0,10);
  expect([...ramp.mask]).toEqual([1,1,0,0]);
});
test('manual selection and keep brush refine the mask without modifying pixels',()=>{
  const data=pixels(Array.from({length:25},()=>[240,240,240])),original=data.slice(),s=createBackgroundSelection(data,5,5);
  s.flood(0,0);s.brush(2,2,1,'keep',0);expect(s.mask[12]).toBe(0);expect(s.mask[0]).toBe(1);
  s.brush(2,2,1,'paint',0);expect([...s.mask].every(Boolean)).toBe(true);expect(data).toEqual(original);
});
test('transparent pixels stop contiguous selection and tolerance controls matching',()=>{
  const data=pixels([[255,255,255],[255,255,255],[240,240,240]]);data[7]=0;
  const s=createBackgroundSelection(data,3,1);s.flood(0,100);expect([...s.mask]).toEqual([1,0,0]);
  const colors=pixels([[255,255,255],[240,240,240]]),narrow=createBackgroundSelection(colors,2,1);narrow.flood(0,0);expect([...narrow.mask]).toEqual([1,0]);
  const wide=createBackgroundSelection(colors,2,1);wide.flood(0,10);expect([...wide.mask]).toEqual([1,1]);
});

test('another stroke can expand an existing selection after increasing tolerance',()=>{
  const s=createBackgroundSelection(pixels([[255,255,255],[240,240,240]]),2,1);
  s.flood(0,0);expect([...s.mask]).toEqual([1,0]);
  s.beginOperation();s.flood(0,10);expect([...s.mask]).toEqual([1,1]);
});
