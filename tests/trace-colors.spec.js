import {test,expect} from '@playwright/test';
import {traceImage} from '../src/image-tracing.js';
import {createColorMatcher,traceColorOptions} from '../src/trace-colors.js';

function stripes(colors,band=12){const width=colors.length*band,height=24,data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++)data.set([...colors[Math.floor(x/band)],255],(y*width+x)*4);return {width,height,data};}
function colorAt(result,x,y){let fill;for(const shape of result.shapes){let inside=false;for(const points of shape.contours){let hit=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}inside=inside!==hit;}if(inside)fill=shape.fill;}return fill;}
const opts={mode:'color',noise:0,smoothing:0,stackColors:false,ignoreWhite:false,preset:'detailed'};
const paints=[[230,20,30],[20,80,220],[255,255,255],[15,15,15],[250,210,20],[120,70,35],[190,130,70],[245,190,140]];

for(const count of [1,3,5,7,9,64])test(`accepts ${count} colors in regular and pixel tracing`,()=>{
 const colors=Array.from({length:count},(_,i)=>[Math.round(255*i/Math.max(1,count-1)),Math.round(255*(1-i/Math.max(1,count-1))),i%2?250:30]),image=stripes(colors,8);
 for(const mode of ['color','pixel'])expect(traceImage(image,{...opts,mode,colors:count,pixelSize:128}).shapes).toHaveLength(count);
});

test('hue grouping keeps shaded red and blue with their anchors instead of crossing into brown or black',()=>{
 const colors=[paints[0],[110,10,15],paints[1],[10,30,100],[225,225,225],paints[3],paints[4],paints[5],paints[6],paints[7]],image=stripes(colors);
 const rgb=traceImage(image,{...opts,colors:8,colorAnchors:paints}),hue=traceImage(image,{...opts,colors:8,colorAnchors:paints,colorGrouping:'hue'});
 expect(colorAt(rgb,18,12)).not.toBe('#e6141e');
 expect(colorAt(hue,6,12)).toBe('#e6141e');expect(colorAt(hue,18,12)).toBe('#e6141e');expect(colorAt(hue,42,12)).toBe('#1450dc');expect(colorAt(hue,54,12)).toBe('#ffffff');
 expect(colorAt(hue,66,12)).toBe('#0f0f0f');expect(colorAt(hue,90,12)).toBe('#784623');expect(colorAt(hue,102,12)).toBe('#be8246');expect(hue.shapes).toHaveLength(8);
});

test('hue wraps at red and separates neutral outlines from chromatic paint',()=>{
 const match=createColorMatcher([[255,0,10],[0,0,255],[0,0,0],[255,255,255]],'hue');
 expect(match([230,10,0])).toBe(0);expect(match([120,0,5])).toBe(0);expect(match([40,40,40])).toBe(2);expect(match([225,225,225])).toBe(3);
});

test('value and saturation group by the requested channel across different hues',()=>{
 expect(createColorMatcher([[255,0,0],[50,0,0]],'value')([0,0,240])).toBe(0);
 expect(createColorMatcher([[255,0,0],[50,0,0]],'value')([0,0,60])).toBe(1);
 expect(createColorMatcher([[240,0,0],[180,170,170]],'saturation')([0,0,130])).toBe(0);
 expect(createColorMatcher([[240,0,0],[180,170,170]],'saturation')([150,150,165])).toBe(1);
 const result=traceImage(stripes([[230,0,0],[0,0,230],[55,0,0],[0,55,0]]),{...opts,colors:2,colorGrouping:'value'});
 expect(colorAt(result,6,12)).toBe(colorAt(result,18,12));expect(colorAt(result,30,12)).toBe(colorAt(result,42,12));expect(colorAt(result,6,12)).not.toBe(colorAt(result,30,12));
});

test('anchors remain exact while unanchored slots can learn additional colors',()=>{
 const result=traceImage(stripes([[245,10,10],[235,10,10],[0,0,255]]),{...opts,colors:2,colorAnchors:[[255,0,0]]});expect(result.shapes.map(s=>s.fill).sort()).toEqual(['#0000ff','#ff0000']);
});

test('invalid counts and anchor lists fail explicitly',()=>{
 for(const colors of [0,1.5,65,NaN])expect(()=>traceImage(stripes(paints),{...opts,colors})).toThrow('whole number');
 expect(()=>traceColorOptions({colors:1,colorAnchors:[[0,0,0],[255,0,0]]})).toThrow('include all');
 expect(()=>traceColorOptions({colors:2,colorAnchors:[[256,0,0]]})).toThrow('Invalid color anchor');
});

test('anchors do not make transparent pixels or excluded areas opaque',()=>{
 const image=stripes([[255,0,0],[0,0,255]]);image.data.fill(0,0,4);image.overrides=new Uint8Array(image.width*image.height);image.overrides[image.width+2]=2;
 const result=traceImage(image,{...opts,colors:2,colorAnchors:[[255,0,0],[0,0,255]],colorGrouping:'hue'});expect(result.selection[0]).toBe(0);expect(result.selection[image.width+2]).toBe(0);
});
