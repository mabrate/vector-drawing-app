import {test,expect} from '@playwright/test';
import paper from 'paper';
import {applyBlob,blobOutline,smoothBlobPoints} from '../src/blob-brush.js';
import {createBucketFill} from '../src/paint-bucket.js';
test.beforeEach(()=>paper.setup(new paper.Size(1056,816)));
const P=(x,y)=>new paper.Point(x,y);
const rect=(parent,x,y,w,h,color='black')=>{const p=new paper.Path.Rectangle({rectangle:[x,y,w,h],insert:false,fillColor:color});parent.addChild(p);return p;};
test('bucket reads compound parent style and fills both the traced body and its hole',()=>{
  const parent=new paper.Group({insert:false}),outer=new paper.Path.Circle({center:[200,200],radius:100,insert:false}),hole=new paper.Path.Circle({center:[200,200],radius:30,insert:false});hole.reverse();
  parent.addChild(new paper.CompoundPath({children:[outer,hole],fillColor:'black',insert:false}));
  const body=createBucketFill(parent,P(260,200),{width:1056,height:816},'#ff0000');expect(body.contains(P(260,200))).toBe(true);expect(body.contains(P(200,200))).toBe(false);expect(parent.children).toHaveLength(1);
  const center=createBucketFill(parent,P(200,200),{width:1056,height:816},'#ff0000');expect(center.contains(P(200,200))).toBe(true);expect(center.contains(P(260,200))).toBe(false);
});
test('blob outline creates a closed round dot and a continuous rounded stroke',()=>{
  const dot=blobOutline([P(100,100)],20);expect(dot.closed).toBe(true);expect(dot.area).toBeCloseTo(Math.PI*100,-1);
  const line=blobOutline([P(100,100),P(200,100),P(200,200)],20);expect(line.contains(P(150,100))).toBe(true);expect(line.contains(P(200,150))).toBe(true);expect(line.contains(P(195,105))).toBe(true);expect(line.contains(P(150,150))).toBe(false);
});
test('blob merges touched paths without spreading to neighboring artwork',()=>{
  const parent=new paper.Group({insert:false}),last=rect(parent,300,100,100,100),middle=rect(parent,200,100,100,100),first=rect(parent,100,100,100,100),separate=rect(parent,600,100,100,100,'blue');
  const result=applyBlob(parent,[P(100,150),P(80,150)],20,'#ff0000');expect(result.merged).toBe(1);expect(parent.children).toHaveLength(4);expect(separate.parent).toBe(parent);expect(result.path.contains(P(350,150))).toBe(false);expect(result.path.fillColor.toCSS(true)).toBe('#ff0000');expect(first.parent).toBe(null);expect(middle.parent).toBe(parent);expect(last.parent).toBe(parent);
});
test('blob retains compound holes and does not merge a dot isolated inside a hole',()=>{
  const parent=new paper.Group({insert:false}),outer=new paper.Path.Circle({center:[200,200],radius:100,insert:false}),hole=new paper.Path.Circle({center:[200,200],radius:40,insert:false});hole.reverse();parent.addChild(new paper.CompoundPath({children:[outer,hole],insert:false,fillColor:'black'}));
  let result=applyBlob(parent,[P(200,200)],20,'#ff0000');expect(result.merged).toBe(0);expect(parent.children).toHaveLength(2);
  result=applyBlob(parent,[P(290,200),P(320,200)],20,'#ff0000');expect(result.merged).toBe(1);expect(result.path.contains(P(220,200))).toBe(false);expect(result.path.contains(P(290,200))).toBe(true);
});
test('blob merges transformed group children without moving the remaining artwork',()=>{
  const parent=new paper.Group({insert:false}),group=new paper.Group({insert:false,applyMatrix:false});parent.addChild(group);rect(group,0,0,100,100);const separate=rect(group,200,0,50,50);group.translate([300,200]);group.rotate(30,P(300,200));const old=separate.globalMatrix.values.slice();
  const inside=group.localToGlobal(P(50,50)),result=applyBlob(parent,[inside],20,'#ff0000');expect(result.merged).toBe(1);expect(result.path.contains(inside)).toBe(true);expect(group.children).toHaveLength(1);expect(separate.globalMatrix.values).toEqual(old);
});
test('blob skips open paths, clipped images and hidden shapes',()=>{
  const parent=new paper.Group({insert:false}),line=new paper.Path({segments:[[100,100],[200,100]],strokeColor:'black',insert:false});parent.addChild(line);const hidden=rect(parent,100,90,100,20);hidden.visible=false;const group=new paper.Group({insert:false});parent.addChild(group);const mask=rect(group,100,90,100,20);mask.clipMask=true;group.clipped=true;
  const result=applyBlob(parent,[P(150,100)],20,'#ff0000');expect(result.merged).toBe(0);expect(parent.children).toHaveLength(4);
});

test('blob smoothing reduces pointer jitter and outline nodes while preserving endpoints',()=>{
  const points=Array.from({length:120},(_,i)=>P(100+i*3,300+(i%2?3:-3)+Math.sin(i/30)*60));
  const rough=blobOutline(points,24,0),smooth=blobOutline(points,24,65),strong=blobOutline(points,24,100);
  expect(smooth.segments.length).toBeLessThan(rough.segments.length/2);expect(strong.segments.length).toBeLessThan(smooth.segments.length);
  const line=Array.from({length:120},(_,i)=>P(100+i*3,300+(i%2?3:-3))),filtered=smoothBlobPoints(line,24,65);
  expect(filtered[0].equals(line[0])).toBe(true);expect(filtered.at(-1).equals(line.at(-1))).toBe(true);
  const interior=filtered.filter(p=>p.x>120&&p.x<430);expect(Math.sqrt(interior.reduce((sum,p)=>sum+(p.y-300)**2,0)/interior.length)).toBeLessThan(1.5);
  expect(smoothBlobPoints(line,24,0)).toBe(line);
});

test('blob edges keep constant width on straight strokes and long smooth curves',()=>{
  for(const smoothing of [65,100,150,200])for(const kind of ['line','arc','sine']){
    const points=Array.from({length:100},(_,i)=>kind==='line'?P(100+i*3,300):kind==='arc'?P(300+100*Math.cos(i/99*Math.PI/2),300+100*Math.sin(i/99*Math.PI/2)):P(100+i*3,300+Math.sin(i/30)*60));
    const outline=blobOutline(points,24,smoothing),centerline=new paper.Path({segments:smoothBlobPoints(points,24,smoothing),insert:false});centerline.simplify(.1+24*.06*Math.min(1,smoothing/100));
    expect(outline.segments.length).toBeLessThan(24);
    for(let i=0;i<500;i++){const p=outline.getPointAt(outline.length*i/500);expect(Math.abs(centerline.getNearestPoint(p).getDistance(p)-12)).toBeLessThan(.2);}
    expect(outline.getIntersections()).toHaveLength(0);
  }
});
test('blob offsets handle returning strokes and preserve the hole in a drawn loop',()=>{
  const returning=blobOutline([[100,100],[200,100],[200,105],[100,105]].map(([x,y])=>P(x,y)),24,65);
  expect(returning.contains(P(150,103))).toBe(true);expect(returning.getIntersections()).toHaveLength(0);expect(Math.abs(returning.area)).toBeLessThan(returning.bounds.area);
  const ring=blobOutline(Array.from({length:81},(_,i)=>P(300+80*Math.cos(i/80*Math.PI*2),300+80*Math.sin(i/80*Math.PI*2))),24,65);
  expect(ring.contains(P(300,300))).toBe(false);expect(ring.contains(P(380,300))).toBe(true);expect(ring.getIntersections()).toHaveLength(0);
});
