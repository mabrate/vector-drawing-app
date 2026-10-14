import {test,expect} from '@playwright/test';
import {traceImage,tracePathData,TRACE_PRESETS} from '../src/image-tracing.js';
function fixture(width,height,background=[255,255,255,255]){
  const data=new Uint8ClampedArray(width*height*4);for(let i=0;i<width*height;i++)data.set(background,i*4);
  return {width,height,data,rect(x,y,w,h,color){for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)data.set(color,(yy*width+xx)*4);}};
}
function area(points){return points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;}

test('trace defaults create a simple black silhouette with a real hole and remove specks',()=>{
  const image=fixture(80,60);image.rect(8,8,60,44,[0,0,0,255]);image.rect(20,20,18,16,[255,255,255,255]);image.rect(75,55,1,1,[0,0,0,255]);
  const result=traceImage(image,{noise:100});expect(result.nodes).toBe(8);expect(result.contourCount).toBe(2);expect(result.removed).toBeGreaterThan(0);expect(result.tooComplex).toBe(false);
  expect(result.shapes[0].fill).toBe('#000000');expect(result.shapes).toHaveLength(1);
  const areas=result.shapes[0].contours.map(area);expect(areas.some(a=>a>0)).toBe(true);expect(areas.some(a=>a<0)).toBe(true);
  const d=tracePathData(result.shapes[0].contours);expect(d.match(/Z/g)).toHaveLength(2);expect(d).not.toMatch(/NaN|Infinity/);
});
test('threshold and inversion trace dark or light areas without tracing transparency',()=>{
  const image=fixture(30,20,[0,0,0,0]);image.rect(2,2,8,8,[140,140,140,255]);image.rect(16,2,8,8,[255,255,255,255]);
  expect(traceImage(image,{threshold:100,noise:0}).nodes).toBe(0);
  expect(traceImage(image,{threshold:180,noise:0}).contourCount).toBe(1);
  const light=traceImage(image,{threshold:220,invert:true,noise:0});expect(light.nodes).toBe(4);expect(area(light.shapes[0].contours[0])).toBe(64);
});
test('color tracing produces limited independent colors and optional white background',()=>{
  const image=fixture(60,30);image.rect(3,3,20,20,[255,0,0,255]);image.rect(30,3,20,20,[0,0,255,255]);
  const result=traceImage(image,{mode:'color',colors:2,noise:0});expect(result.shapes.map(s=>s.fill).sort()).toEqual(['#0000ff','#ff0000']);expect(result.nodes).toBe(8);
  const white=traceImage(image,{mode:'color',colors:4,ignoreWhite:false,noise:0});expect(white.shapes.some(s=>s.fill==='#ffffff')).toBe(true);
});
test('diagonal regions stay separate and curved outlines use fewer nodes than pixels',()=>{
  const diagonal=fixture(4,4);diagonal.rect(1,1,1,1,[0,0,0,255]);diagonal.rect(2,2,1,1,[0,0,0,255]);
  const split=traceImage(diagonal,{noise:0});expect(split.contourCount).toBe(2);expect(split.nodes).toBe(8);
  const image=fixture(160,160);for(let y=0;y<160;y++)for(let x=0;x<160;x++)if((x-80)**2+(y-80)**2<60**2)image.data.set([0,0,0,255],(y*160+x)*4);
  const circle=traceImage(image,{noise:0});expect(circle.nodes).toBeGreaterThan(8);expect(circle.nodes).toBeLessThan(60);expect(circle.tooComplex).toBe(false);
});
test('complex traces are blocked rather than silently dropping large regions',()=>{
  const image=fixture(160,160);for(let y=2;y<158;y+=10)for(let x=2;x<158;x+=10)image.rect(x,y,4,4,[0,0,0,255]);
  const result=traceImage(image,{noise:0});expect(result.contourCount).toBe(256);expect(result.tooComplex).toBe(true);expect(result.shapes[0].contours).toHaveLength(256);
  expect(TRACE_PRESETS.simple.maxNodes).toBe(1000);
});

function containsTrace(result,x,y){return result.shapes.some(shape=>shape.contours.reduce((inside,points)=>{let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return inside!==hit;},false));}
test('hole filling includes interior highlights without admitting outside shadows',()=>{
  const image=fixture(80,60);image.rect(10,10,45,40,[0,0,0,255]);image.rect(20,20,20,20,[210,210,210,255]);image.rect(60,10,15,40,[190,190,190,255]);
  const normal=traceImage(image,{noise:0}),filled=traceImage(image,{noise:0,fillHoles:true});
  expect(containsTrace(normal,30.5,30.5)).toBe(false);expect(containsTrace(filled,30.5,30.5)).toBe(true);expect(containsTrace(filled,65.5,30.5)).toBe(false);expect(filled.holesFilled).toBe(1);expect(filled.contourCount).toBe(1);
});
test('manual inclusions survive speck cleanup and exclusions survive automatic hole filling',()=>{
  const image=fixture(80,60);image.rect(10,10,50,40,[0,0,0,255]);image.rect(25,20,20,20,[255,255,255,255]);
  image.overrides=new Uint8Array(80*60);image.overrides[5*80+5]=1;image.overrides[30*80+30]=2;
  const corrected=traceImage(image,{noise:100,fillHoles:true});
  expect(containsTrace(corrected,5.5,5.5)).toBe(true);expect(containsTrace(corrected,30.5,30.5)).toBe(false);expect(containsTrace(corrected,35.5,30.5)).toBe(true);
  expect(corrected.correctedPixels).toBe(2);
});
test('hole filling preserves transparent cutouts and can use a manually closed gap',()=>{
  const image=fixture(50,50);image.rect(10,10,30,30,[0,0,0,255]);image.rect(20,20,10,10,[255,255,255,0]);
  expect(containsTrace(traceImage(image,{fillHoles:true,noise:0}),25.5,25.5)).toBe(false);
  image.rect(20,20,10,10,[255,255,255,255]);image.rect(24,10,2,10,[255,255,255,255]);
  expect(containsTrace(traceImage(image,{fillHoles:true,noise:0}),25.5,25.5)).toBe(false);
  image.overrides=new Uint8Array(2500);for(let x=24;x<26;x++)image.overrides[12*50+x]=1;
  expect(containsTrace(traceImage(image,{fillHoles:true,noise:0}),25.5,25.5)).toBe(true);
});
test('include and exclude marks override threshold and color choices',()=>{
  const image=fixture(40,20);image.rect(2,2,12,12,[255,0,0,255]);image.rect(22,2,12,12,[0,0,255,255]);image.overrides=new Uint8Array(800);image.overrides[8*40+8]=2;image.overrides[17*40+17]=1;
  for(const options of [{threshold:1},{threshold:255},{mode:'color',colors:2}]){const result=traceImage(image,{...options,noise:0});expect(containsTrace(result,8.5,8.5)).toBe(false);expect(containsTrace(result,17.5,17.5)).toBe(true);}
});

function curvePoints(loop){const points=[];for(let i=0;i<loop.length;i++){const [p,,out]=loop[i],[q,into]=loop[(i+1)%loop.length],a=p.map((v,c)=>v+out[c]),b=q.map((v,c)=>v+into[c]);for(let j=0;j<10;j++){const t=j/10,s=1-t;points.push(p.map((v,c)=>s*s*s*v+3*s*s*t*a[c]+3*s*t*t*b[c]+t*t*t*q[c]));}}return points;}
test('smoothing fits accurate curves with fewer anchors while preserving sharp corners',()=>{
  const image=fixture(160,160);for(let y=0;y<160;y++)for(let x=0;x<160;x++)if((x-80)**2+(y-80)**2<3600)image.data.set([0,0,0,255],(y*160+x)*4);
  const rough=traceImage(image,{noise:0,preset:'detailed',smoothing:0}),smooth=traceImage(image,{noise:0,preset:'detailed',smoothing:70});
  const error=result=>{const values=curvePoints(result.shapes[0].segments[0]).map(p=>Math.abs(Math.hypot(p[0]-80.5,p[1]-80.5)-60));return {rms:Math.sqrt(values.reduce((sum,v)=>sum+v*v,0)/values.length),max:Math.max(...values)};};
  expect(smooth.nodes).toBeLessThan(rough.nodes/3);expect(error(smooth).rms).toBeLessThan(error(rough).rms*.85);expect(error(smooth).max).toBeLessThan(.7);expect(tracePathData(smooth.shapes[0].contours,smooth.shapes[0].segments)).toContain('C');
  const square=fixture(80,60);square.rect(10,10,50,40,[0,0,0,255]);const result=traceImage(square,{smoothing:100,noise:0});expect(result.nodes).toBe(4);expect(result.shapes[0].contours[0]).toEqual([[10,10],[60,10],[60,50],[10,50]]);expect(result.shapes[0].segments[0].every(([,a,b])=>a.every(v=>v===0)&&b.every(v=>v===0))).toBe(true);
});
test('neighboring colors share identical curved edges at three-color junctions',()=>{
  const image=fixture(120,100);for(let y=10;y<90;y++)for(let x=10;x<110;x++)image.data.set(x<60+Math.sin((y-10)/80*Math.PI)*20?[255,0,0,255]:[0,0,255,255],(y*120+x)*4);
  const result=traceImage(image,{mode:'color',colors:2,smoothing:70,noise:0});
  const edges=shape=>shape.segments.flatMap(loop=>loop.map(([p,,out],i)=>{const [q,into]=loop[(i+1)%loop.length];return [p,p.map((v,c)=>v+out[c]),q.map((v,c)=>v+into[c]),q];}));
  const a=edges(result.shapes[0]),b=edges(result.shapes[1]);const shared=a.filter(edge=>b.some(other=>JSON.stringify(edge)===JSON.stringify(other.slice().reverse())));
  expect(shared.length).toBeGreaterThan(2);expect(shared.some(([p,c])=>p.some((v,i)=>v!==c[i]))).toBe(true);
});
test('flat-art palette ignores blended edge colors and supports twelve actual colors',()=>{
  const image=fixture(60,30);image.rect(4,4,20,20,[255,0,0,255]);image.rect(30,4,20,20,[0,0,255,255]);image.rect(24,4,1,20,[255,140,140,255]);image.rect(50,4,1,20,[140,140,255,255]);
  expect(traceImage(image,{mode:'color',colors:8,noise:0}).shapes.map(s=>s.fill).sort()).toEqual(['#0000ff','#ff0000']);
  const many=fixture(120,30),colors=Array.from({length:12},(_,i)=>[(i%3)*100,Math.floor(i/3)*65,255-i*15]);colors.forEach((c,i)=>many.rect(i*10+1,4,8,20,[...c,255]));
  expect(traceImage(many,{mode:'color',colors:12,noise:0}).shapes).toHaveLength(12);
});

test('blended edge pixels use neighboring colors rather than an unrelated palette color',()=>{
  const image=fixture(80,40,[255,0,0,255]);image.rect(40,0,40,40,[0,0,255,255]);image.rect(39,0,1,40,[128,0,128,255]);image.rect(10,10,12,12,[128,0,128,255]);
  const result=traceImage(image,{mode:'color',colors:4,smoothing:70,noise:0}),purple={...result,shapes:result.shapes.filter(s=>s.fill==='#800080')};
  expect(containsTrace(purple,15.5,15.5)).toBe(true);expect(containsTrace(purple,39.5,25.5)).toBe(false);expect(containsTrace(result,39.5,25.5)).toBe(true);
});
test('removing a small color fleck restores the surrounding region rather than punching a hole',()=>{
  const image=fixture(160,160,[255,0,0,255]);image.rect(75,75,3,3,[0,0,255,255]);
  const result=traceImage(image,{mode:'color',colors:2,noise:100});expect(result.removed).toBeGreaterThan(0);expect(containsTrace(result,76.5,76.5)).toBe(true);expect(result.shapes.map(s=>s.fill)).toEqual(['#ff0000']);
});

test('small round traces keep smooth handles and long ellipses avoid radial lumps',()=>{
  for(const [rx,ry] of [[4,4],[6,6],[10,10],[150,35]]){
    const width=rx*2+20,height=ry*2+20,cx=rx+10,cy=ry+10,image=fixture(width,height);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(((x-cx)/rx)**2+((y-cy)/ry)**2<1)image.data.set([0,0,0,255],(y*width+x)*4);
    const result=traceImage(image,{noise:0,smoothing:70}),loop=result.shapes[0].segments[0];
    expect(loop.every(([,into,out])=>into.some(Boolean)&&out.some(Boolean))).toBe(true);
    const errors=curvePoints(loop).map(([x,y])=>Math.abs(Math.hypot((x-cx-.5)/rx,(y-cy-.5)/ry)-1)*Math.min(rx,ry));
    expect(Math.max(...errors)).toBeLessThan(1);
    expect(Math.sqrt(errors.reduce((s,v)=>s+v*v,0)/errors.length)).toBeLessThan(.55);
    // Every join uses opposing, collinear handles despite unequal anchor spacing.
    for(const [,a,b] of loop){expect(Math.abs(a[0]*b[1]-a[1]*b[0])).toBeLessThan(1e-6);expect(a[0]*b[0]+a[1]*b[1]).toBeLessThan(0);}
  }
});
