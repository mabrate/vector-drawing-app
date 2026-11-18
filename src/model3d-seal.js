// A portable luminance/alpha snapshot keeps seals editable even when their
// original artwork is later removed. Distances are millimeters.
import {draftSealHeights} from './model3d-seal-draft.js';
export const MAX_SEAL_PIXELS=1024*1024;
export const MAX_SEAL_CELLS=4608;
export const MAX_PHOTO_SEAL_CELLS=524288;
export const photoSeal=feature=>feature.surface==='photo';
const decodedSources=new WeakMap();
export function sealPixels(source){
  if(source.pixels)return source.pixels;
  if(decodedSources.has(source))return decodedSources.get(source);
  const bytes=Uint8Array.from(atob(source.packed),char=>char.charCodeAt(0));
  const pixels=new Uint8Array(source.columns*source.rows*2);
  for(let i=0;i<pixels.length/2;i++){pixels[i*2]=bytes[i*source.channels];pixels[i*2+1]=source.channels===1?255:bytes[i*2+1];}
  decodedSources.set(source,pixels);return pixels;
}
export function packSealPixels(pixels){
  let opaque=true;for(let i=1;i<pixels.length;i+=2)if(pixels[i]!==255){opaque=false;break;}
  const channels=opaque?1:2,bytes=opaque?Uint8Array.from({length:pixels.length/2},(_,i)=>pixels[i*2]):pixels;
  let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.slice(i,i+8192));
  return {packed:btoa(binary),channels};
}
const positive=n=>Number.isFinite(n)&&n>0&&n<=10000;
export function validSealSource(source){
  if(!source||typeof source.name!=='string'||source.name.length>100||!positive(source.width)||!positive(source.height)||
    !Number.isInteger(source.columns)||source.columns<2||source.columns>1024||!Number.isInteger(source.rows)||source.rows<2||source.rows>1024)return false;
  const size=source.columns*source.rows;
  if(source.pixels!==undefined)return source.packed===undefined&&Array.isArray(source.pixels)&&source.pixels.length===size*2&&source.pixels.every(n=>Number.isInteger(n)&&n>=0&&n<=255);
  const bytes=size*source.channels,padding=(3-bytes%3)%3;
  return [1,2].includes(source.channels)&&typeof source.packed==='string'&&source.packed.length===Math.ceil(bytes/3)*4&&
    /^[A-Za-z0-9+/]*={0,2}$/.test(source.packed)&&source.packed.endsWith('='.repeat(padding))&&(padding>0?source.packed.at(-padding-1)!=='=':!source.packed.endsWith('='));
}
export const sealMinimumDiameter=feature=>feature.source?(feature.source.width+(feature.gapAround??0))*feature.around/Math.PI:0;
export const sealArtworkHeight=feature=>feature.source.height*feature.vertical+(feature.gapVertical??0)*(feature.vertical-1);
export const sealEffect=feature=>feature.effect??'deboss';
export function sealError(feature){
  if(!validSealSource(feature.source))return 'Choose an image or path from the drawing for the seal.';
  if(![feature.around,feature.vertical].every(n=>Number.isInteger(n)&&n>=1&&n<=16))return 'Use whole repeat counts from 1 to 16.';
  if(['gapAround','gapVertical'].some(key=>feature[key]!==undefined&&(!Number.isFinite(feature[key])||feature[key]<0||feature[key]>10000)))return 'Use nonnegative repeat gaps up to 10,000 mm.';
  if(!positive(feature.diameter)||feature.diameter+1e-7<sealMinimumDiameter(feature))return 'Diameter must fit every repeat at its original size. Use Fit diameter, or enter a larger diameter.';
  if(feature.effect!==undefined&&!['emboss','deboss'].includes(feature.effect))return 'Choose Emboss or Deboss for the cylinder surface.';
  if(feature.draftAngle!==undefined&&(!Number.isFinite(feature.draftAngle)||feature.draftAngle<0||feature.draftAngle>80))return 'Use a seal draft angle from 0° (off) to 80°.';
  if(!positive(feature.depth)||sealEffect(feature)==='deboss'&&feature.depth>=feature.diameter/2)return sealEffect(feature)==='emboss'?'Use a positive emboss height up to 10,000 mm.':'Use a positive engraving depth smaller than the cylinder radius.';
  if(['marginTop','marginBottom'].some(key=>feature[key]!==undefined&&(!Number.isFinite(feature[key])||feature[key]<0||feature[key]>10000)))return 'Use nonnegative top and bottom margins up to 10,000 mm.';
  if(feature.surface!==undefined&&!['cad','photo'].includes(feature.surface))return 'Choose Photo STL or CAD / STEP for the seal surface.';
  const minDetail=photoSeal(feature) ? .02 : .1;
  if(!positive(feature.detail)||feature.detail<minDetail||feature.detail>5)return `Use a detail size from ${minDetail} to 5 mm.`;
  if(!['darkest','lightest'].includes(feature.engrave)||typeof feature.mirror!=='boolean')return 'Choose the color to engrave and the mirror setting.';
  if(sealArtworkHeight(feature)+(feature.marginTop??0)+(feature.marginBottom??0)>10000)return 'The cylinder height, including repeats, gaps and margins, must be no more than 10,000 mm.';
  return '';
}

export function sealGrid(feature){
  const circumference=feature.diameter*Math.PI,artHeight=sealArtworkHeight(feature),marginTop=feature.marginTop??0,marginBottom=feature.marginBottom??0,height=artHeight+marginTop+marginBottom;
  const marginRows=Number(marginTop>0)+Number(marginBottom>0);
  // Preserve at least four samples per motif in either direction. A bounded
  // grid avoids unbounded CAD work; report its actual pitch in the tool.
  let columns=Math.max(64,feature.around*4,Math.ceil(circumference/feature.detail));
  let rows=Math.max(feature.vertical*4,Math.ceil(artHeight/feature.detail));
  const budget=photoSeal(feature)?MAX_PHOTO_SEAL_CELLS:MAX_SEAL_CELLS;
  const factor=Math.min(1,Math.sqrt(budget/(columns*(rows+1+marginRows))));
  columns=Math.max(64,feature.around*4,Math.floor(columns*factor));
  rows=Math.max(feature.vertical*4,Math.floor(rows*factor));
  columns=Math.min(columns,Math.floor(budget/(feature.vertical*4+1+marginRows)));
  rows=Math.min(rows,Math.floor(budget/columns)-1-marginRows);
  const gapAround=feature.gapAround??0,gapVertical=feature.gapVertical??0,wrappedWidth=(feature.source.width+gapAround)*feature.around;
  const distances=gapAround?spacedAxis(feature.source.width,feature.around,gapAround,columns,Math.max(0,circumference-wrappedWidth),true):null;
  const axial=gapVertical&&feature.vertical>1?spacedAxis(feature.source.height,feature.vertical,gapVertical,rows):null;
  const maxStep=values=>{let step=0;for(let i=1;i<values.length;i++)step=Math.max(step,values[i]-values[i-1]);return step;};
  return {columns,rows:rows+marginRows,artRows:rows,artHeight,marginTop,marginBottom,circumference,height,distances,axial,pitch:Math.max(distances?maxStep(distances):circumference/columns,axial?maxStep(axial):artHeight/rows),sourcePitch:Math.max(feature.source.width/feature.source.columns,feature.source.height/feature.source.rows),limited:factor<1};
}

// Allocate the existing bounded grid across artwork and blank intervals.
// Exact boundary samples keep even gaps smaller than the detail pitch blank.
function spacedAxis(size,repeats,gap,steps,extra=0,wrap=false){
  const bands=[];
  for(let i=0;i<repeats;i++){
    bands.push({length:size,steps:3});
    if(wrap||i<repeats-1)bands.push({length:gap,steps:1});
  }
  if(extra>0)bands.at(-1).length+=extra;
  const length=bands.reduce((sum,band)=>sum+band.length,0),remaining=steps-bands.reduce((sum,band)=>sum+band.steps,0);
  const shares=bands.map(band=>remaining*band.length/length);
  shares.forEach((share,i)=>bands[i].steps+=Math.floor(share));
  const spare=steps-bands.reduce((sum,band)=>sum+band.steps,0);
  shares.map((share,i)=>({i,fraction:share%1})).sort((a,b)=>b.fraction-a.fraction).slice(0,spare).forEach(({i})=>bands[i].steps++);
  const values=[0];let offset=0;
  for(const band of bands){for(let i=1;i<=band.steps;i++)values.push(offset+band.length*i/band.steps);offset+=band.length;}
  return values;
}

// Bilinear interpolation uses premultiplied engraving strength so transparent
// black/white pixels never cut into the cylinder, in either polarity.
export function sealStrength(source,u,v,engrave){
  const pixels=sealPixels(source);
  const x=Math.max(0,Math.min(1,u))*source.columns-.5,y=Math.max(0,Math.min(1,v))*source.rows-.5;
  const x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;
  const at=(a,b)=>{const i=(Math.max(0,Math.min(source.rows-1,b))*source.columns+Math.max(0,Math.min(source.columns-1,a)))*2;return (engrave==='darkest'?1-pixels[i]/255:pixels[i]/255)*pixels[i+1]/255;};
  return (at(x0,y0)*(1-fx)+at(x0+1,y0)*fx)*(1-fy)+(at(x0,y0+1)*(1-fx)+at(x0+1,y0+1)*fx)*fy;
}

export function sealMesh(feature){
  const error=sealError(feature);if(error)throw Error(error);
  const {columns,rows,artRows,artHeight,marginTop,marginBottom,circumference,height,distances,axial}=sealGrid(feature),{source}=feature,radius=feature.diameter/2,sign=sealEffect(feature)==='emboss'?1:-1;
  const gapAround=feature.gapAround??0,gapVertical=feature.gapVertical??0;
  const count=columns*(rows+1),vertices=photoSeal(feature)?new Float32Array((count+2)*3):[],triangles=photoSeal(feature)?new Uint32Array(count*6):[],wrappedWidth=(source.width+gapAround)*feature.around;
  const levels=Array.from({length:rows+1},(_,j)=>{const artRow=j-Number(marginBottom>0);return artRow<0?0:artRow>artRows?height:marginBottom+(axial?axial[artRow]:artRow/artRows*artHeight);});
  function reliefAt(i,j){
    const artRow=j-Number(marginBottom>0),blank=artRow<0||artRow>artRows||marginBottom>0&&artRow===0||marginTop>0&&artRow===artRows;
    const distance=distances?distances[i]:i/columns*circumference;
    if(blank||distance>=wrappedWidth)return 0;
    const across=distance%(source.width+gapAround),fromTop=artHeight-(levels[j]-marginBottom),down=fromTop%(source.height+gapVertical);
    // Both sides of a blank interval lie on the unmodified cylinder surface.
    const epsilon=1e-8;
    if(gapAround&&(across<epsilon||across>=source.width-epsilon))return 0;
    if(gapVertical&&feature.vertical>1&&fromTop>epsilon&&fromTop<artHeight-epsilon&&(down<epsilon||down>=source.height-epsilon))return 0;
    let u=gapAround?across/source.width:(distance/source.width)%1;if(feature.mirror)u=1-u;
    const v=gapVertical&&feature.vertical>1?(artRow===0?1:down/source.height):(artRow===0?1:((artRows-artRow)/artRows*feature.vertical)%1);
    return feature.depth*sealStrength(source,u,v,feature.engrave);
  }
  let drafted=null;
  if(sign===1&&feature.draftAngle){
    const heights=new Float64Array(count);
    for(let j=0;j<=rows;j++)for(let i=0;i<columns;i++)heights[j*columns+i]=reliefAt(i,j);
    const arcPitch=distances?Float64Array.from({length:columns},(_,i)=>distances[i+1]-distances[i]):circumference/columns;
    drafted=draftSealHeights(heights,columns,levels,arcPitch,feature.draftAngle);
  }
  let vertexOffset=0,triangleOffset=0;
  const vertex=(x,y,z)=>{if(Array.isArray(vertices))vertices.push(x,y,z);else{vertices[vertexOffset++]=x;vertices[vertexOffset++]=y;vertices[vertexOffset++]=z;}};
  const triangle=(a,b,c)=>{if(Array.isArray(triangles))triangles.push(a,b,c);else{triangles[triangleOffset++]=a;triangles[triangleOffset++]=b;triangles[triangleOffset++]=c;}};
  for(let j=0;j<=rows;j++){
    // Explicit boundary rings keep even sub-sample margins completely blank.
    // Blank bands add only axial rings, preserving the artwork's sampling pitch.
    for(let i=0;i<columns;i++){
      const theta=distances?distances[i]/circumference*Math.PI*2:i/columns*Math.PI*2,relief=drafted?drafted[j*columns+i]:reliefAt(i,j),r=radius+sign*relief;
      vertex(r*Math.cos(theta),r*Math.sin(theta),levels[j]);
    }
  }
  const index=(i,j)=>j*columns+(i%columns);
  for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
    const a=index(i,j),b=index(i+1,j),c=index(i+1,j+1),d=index(i,j+1);triangle(a,b,c);triangle(a,c,d);
  }
  const bottom=count,top=count+1;vertex(0,0,0);vertex(0,0,height);
  for(let i=0;i<columns;i++){triangle(bottom,index(i+1,0),index(i,0));triangle(top,index(i,rows),index(i+1,rows));}
  return {vertices,triangles};
}

export function sealArtwork(paper,items,selection=[]){
  const sources=[];
  function visit(item){
    if(!item.visible||item.guide)return;
    if(item instanceof paper.Group&&!item.clipped){item.children.forEach(visit);return;}
    if(!(item instanceof paper.PathItem||item instanceof paper.Raster||item instanceof paper.Group&&item.clipped))return;
    sources.push({id:String(item.id),item,name:(item.name||`${item instanceof paper.PathItem?'Path':'Image'} ${sources.length+1}`).slice(0,100),selected:selection.some(selected=>selected===item||selected.isAncestor(item))});
  }
  items.forEach(visit);return sources;
}

export function snapshotSealArtwork(paper,entry,mmPerPixel){
  const rasters=entry.item instanceof paper.Raster?[entry.item]:entry.item.getItems({class:paper.Raster});
  if(rasters.some(raster=>!raster.loaded))throw Error('This image is still loading. Choose the artwork again once it has loaded.');
  const clone=entry.item.clone({insert:false});let raster;
  try{
    clone.matrix=entry.item.globalMatrix;clone.selected=false;
    const bounds=clone.strokeBounds;
    if(bounds.width<=0||bounds.height<=0)throw Error('This artwork has no visible area.');
    // Draw into exact artwork bounds, without rasterize()'s integer-pixel
    // padding. Clipped images retain their crop and all enclosing transforms.
    const columns=Math.max(2,Math.round(1024*bounds.width/Math.max(bounds.width,bounds.height))),rows=Math.max(2,Math.round(1024*bounds.height/Math.max(bounds.width,bounds.height)));
    const group=new paper.Group({children:[clone],insert:false});
    group.translate(bounds.topLeft.negate());group.scale(columns/bounds.width,rows/bounds.height,new paper.Point(0,0));
    raster=group.rasterize({resolution:72,insert:false});group.remove();
    const canvas=document.createElement('canvas');canvas.width=columns;canvas.height=rows;
    const context=canvas.getContext('2d',{willReadFrequently:true}),rasterBounds=raster.bounds;
    context.drawImage(raster.canvas,-rasterBounds.x,-rasterBounds.y,columns,rows,0,0,columns,rows);
    const rgba=context.getImageData(0,0,columns,rows).data,pixels=new Uint8Array(columns*rows*2);
    for(let i=0;i<rgba.length;i+=4){pixels[i/2]=Math.round(.2126*rgba[i]+.7152*rgba[i+1]+.0722*rgba[i+2]);pixels[i/2+1]=rgba[i+3];}
    const source={name:entry.name,width:bounds.width*mmPerPixel,height:bounds.height*mmPerPixel,columns,rows,...packSealPixels(pixels)};
    if(!validSealSource(source))throw Error('This artwork is too large for a cylinder seal.');return source;
  }finally{raster?.remove();clone.remove();}
}
