export const TRACE_COLOR_LIMIT=64;
export const TRACE_COLOR_GROUPS=['rgb','hue','value','saturation'];

export function traceColorOptions(settings={}){
 const count=Number(settings.colors??4);
 if(!Number.isInteger(count)||count<1||count>TRACE_COLOR_LIMIT)throw Error(`Choose a whole number from 1 to ${TRACE_COLOR_LIMIT} colors.`);
 const grouping=TRACE_COLOR_GROUPS.includes(settings.colorGrouping)?settings.colorGrouping:'rgb',anchors=[];
 if(settings.colorAnchors!==undefined&&!Array.isArray(settings.colorAnchors))throw Error('Invalid color anchors.');
 for(const rgb of settings.colorAnchors||[]){
  if(!Array.isArray(rgb)||rgb.length!==3||!rgb.every(v=>Number.isInteger(v)&&v>=0&&v<=255))throw Error('Invalid color anchor.');
  if(!anchors.some(a=>a.every((v,i)=>v===rgb[i])))anchors.push([...rgb]);
 }
 if(anchors.length>count)throw Error('The color count must include all sampled anchors.');
 return {count,grouping,anchors};
}

// Hue wraps at red. Near-black and neutral colors have no useful hue, so keep
// them separate from chromatic paint instead of assigning them a red hue.
export function colorVector(rgb,grouping){
 if(grouping==='rgb')return rgb;
 const [r,g,b]=rgb.map(v=>v/255),v=Math.max(r,g,b),min=Math.min(r,g,b),delta=v-min,s=v?delta/v:0;
 if(grouping==='value')return [v*255];
 if(grouping==='saturation')return [s*255];
 let h=0;if(delta)h=((v===r?(g-b)/delta:v===g?2+(b-r)/delta:4+(r-g)/delta)/6+1)%1;
 return [Math.cos(h*2*Math.PI)*255,Math.sin(h*2*Math.PI)*255,s*255,v*255,v<.12?0:s<.15?1:2];
}
export function vectorDistance(a,b,grouping){
 if(grouping!=='hue')return a.reduce((sum,v,i)=>sum+(v-b[i])**2,0);
 if(a[4]!==2&&b[4]!==2)return (a[3]-b[3])**2+.1*(a[2]-b[2])**2;
 if(a[4]!==b[4])return 3*255**2+(a[3]-b[3])**2;
 return .65*((a[0]-b[0])**2+(a[1]-b[1])**2)+.15*(a[2]-b[2])**2+.12*(a[3]-b[3])**2;
}
export function createColorDistance(grouping){
 const vectors=new WeakMap();const vector=rgb=>{if(!vectors.has(rgb))vectors.set(rgb,colorVector(rgb,grouping));return vectors.get(rgb);};
 return (a,b)=>vectorDistance(vector(a),vector(b),grouping);
}
export function createColorMatcher(palette,grouping){
 const vectors=palette.map(rgb=>colorVector(rgb,grouping));
 return rgb=>{const sample=colorVector(rgb,grouping);let index=-1,best=Infinity;for(let i=0;i<vectors.length;i++){const d=vectorDistance(sample,vectors[i],grouping);if(d<best){best=d;index=i;}}return index;};
}
