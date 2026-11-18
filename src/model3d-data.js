// The portable recipe is independent of Paper.js and the CAD kernel. All model
// coordinates and distances are millimeters; the drawing uses 96 px per inch.
import {validSTLMesh,MAX_MODEL_TRIANGLES} from './model3d-stl.js';
import {CHAMFER_KINDS} from './model3d-chamfer-intent.js';
import {sealError,sealGrid,MAX_SEAL_PIXELS,MAX_PHOTO_SEAL_CELLS} from './model3d-seal.js';
import {cookieError} from './model3d-cookie.js';
export const MM_PER_PIXEL=25.4/96;
export const MAX_TREATMENT_EDGES=4000;
export const MAX_SHELL_FACES=1000;
export const MAX_TEXTURE_ELEMENTS=256;
export const emptyModel=()=>({version:1,features:[]});
const finite=(value,limit=100000)=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=limit;
const point=value=>Array.isArray(value)&&value.length===2&&value.every(n=>finite(n));
const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value);

export function validModel(model){
  if(!model||model.version!==1||!Array.isArray(model.features)||model.features.length>100)return false;
  const ids=new Set(),bodies=new Set();let curves=0,edges=0,triangles=0,sealPixels=0,sealCells=0;
  const wire=value=>Array.isArray(value)&&value.length>0&&value.length<=2000&&value.every(curve=>{
    curves++;return Array.isArray(curve)&&curve.length===4&&curve.every(point);
  });
  for(const feature of model.features){
    if(!feature||!identifier(feature.id)||ids.has(feature.id)||typeof feature.name!=='string'||feature.name.length>100)return false;
    ids.add(feature.id);
    if(feature.kind==='cookie'){
      if(feature.operation!=='new'||feature.target!==null||cookieError(feature))return false;
      for(const shape of [feature.cut,...feature.emboss]){
        if(!shape||typeof shape.name!=='string'||shape.name.length>100||!Array.isArray(shape.profile)||!shape.profile.length||shape.profile.length>100||!shape.profile.every(face=>face&&wire(face.outer)&&Array.isArray(face.holes)&&face.holes.length<=100&&face.holes.every(wire)))return false;
      }
      bodies.add(feature.id);
    }else if(feature.kind==='seal'){
      if(feature.operation!=='new'||feature.target!==null||sealError(feature))return false;
      sealPixels+=feature.source.columns*feature.source.rows;bodies.add(feature.id);
      const grid=sealGrid(feature);sealCells+=grid.columns*(grid.rows+1);
    }else if(feature.kind==='stl'){
      if(feature.operation!=='new'||feature.target!==null||!finite(feature.scale,1000)||feature.scale<=0||!validSTLMesh(feature.mesh)||feature.mesh.vertices.some(value=>Math.abs(value*feature.scale)>100000))return false;
      triangles+=feature.mesh.triangles.length/3;bodies.add(feature.id);
    }else if(feature.kind==='extrusion'){
      if(feature.sourceIds!==undefined&&(!Array.isArray(feature.sourceIds)||!feature.sourceIds.length||feature.sourceIds.length>1000||new Set(feature.sourceIds).size!==feature.sourceIds.length||!feature.sourceIds.every(identifier)))return false;
      if(feature.sourceError!==undefined&&(!feature.sourceIds||typeof feature.sourceError!=='string'||!feature.sourceError.length||feature.sourceError.length>400))return false;
      if(!['new','join','cut'].includes(feature.operation)||!finite(feature.height,10000)||feature.height<=0||!finite(feature.start,10000)||!finite(feature.draft,60))return false;
      if(feature.operation==='new'){if(feature.target!==null)return false;bodies.add(feature.id);}
      else if(!bodies.has(feature.target))return false;
      if(!Array.isArray(feature.profile)||!feature.profile.length||feature.profile.length>100||!feature.profile.every(face=>face&&wire(face.outer)&&Array.isArray(face.holes)&&face.holes.length<=100&&face.holes.every(wire)))return false;
    }else if(feature.kind==='texture'){
      if(!bodies.has(feature.target)||!['ribs','dots','squares'].includes(feature.pattern)||!['raised','engraved'].includes(feature.mode)||!finite(feature.spacing,1000)||feature.spacing<=0||!finite(feature.width,1000)||feature.width<=0||feature.width>=feature.spacing||!finite(feature.depth,1000)||feature.depth<=0||!finite(feature.angle,180)||!Array.isArray(feature.faces)||!feature.faces.length||feature.faces.length>16||new Set(feature.faces).size!==feature.faces.length||!feature.faces.every(face=>typeof face==='string'&&face.length>0&&face.length<=300))return false;
    }else if(feature.kind==='shell'){
      if(!bodies.has(feature.target)||!finite(feature.thickness,1000)||feature.thickness<=0||!['inside','outside'].includes(feature.direction)||!Array.isArray(feature.faces)||!feature.faces.length||feature.faces.length>MAX_SHELL_FACES||new Set(feature.faces).size!==feature.faces.length||!feature.faces.every(face=>typeof face==='string'&&face.length>0&&face.length<=300))return false;
    }else if(['chamfer','fillet'].includes(feature.kind)){
      if(!bodies.has(feature.target)||!finite(feature.amount,1000)||feature.amount<=0||!Array.isArray(feature.edges)||!feature.edges.length||feature.edges.length>MAX_TREATMENT_EDGES||!feature.edges.every(edge=>typeof edge==='string'&&edge.length<=300))return false;
      edges+=feature.edges.length;
      if(feature.kind==='chamfer'){
        if(feature.cleanupTolerance!==undefined&&feature.cleanupTolerance!==.01)return false;
        if(feature.intent!==undefined&&(!feature.intent||feature.intent.version!==1||!Array.isArray(feature.intent.contours)||!feature.intent.contours.length||feature.intent.contours.length>100||!feature.intent.contours.every(contour=>contour&&CHAMFER_KINDS.includes(contour.kind)&&[-1,1].includes(contour.side)&&Array.isArray(contour.bounds)&&contour.bounds.length===6&&contour.bounds.every(n=>finite(n,3))&&contour.bounds.slice(0,3).every((n,i)=>n<=contour.bounds[i+3]))))return false;
      }
    }else return false;
  }
  return curves<=4000&&edges<=12000&&triangles<=MAX_MODEL_TRIANGLES&&sealPixels<=MAX_SEAL_PIXELS*8&&sealCells<=MAX_PHOTO_SEAL_CELLS*2;
}

export function readModel(value){
  if(value==null)return emptyModel();
  if(!validModel(value))throw Error('This drawing has invalid or unsupported 3D model data.');
  return structuredClone(value);
}

// Normalize the filled silhouette first, so winding rules, nested holes and
// overlapping subpaths have the same interpretation in 2D and in the kernel.
export function selectionProfiles(paper,items){
  if(!items.length)throw Error('Select one or more closed vector paths in the drawing first.');
  const profiles=[];let count=0;
  function add(item){
    if(item instanceof paper.Group&&!item.clipped){if(!item.children.length)throw Error('This group has no closed paths.');item.children.forEach(add);return;}
    if(!(item instanceof paper.PathItem))throw Error('Use closed vector paths. Convert text or strokes to paths first; images cannot be extruded.');
    const source=item instanceof paper.CompoundPath?item.children:[item];
    if(!source.length||source.some(path=>!path.closed||path.segments.length<2))throw Error('Close every selected path before extruding it.');
    let copy,normalized;
    try{
      // Paper can discard a compound's matrix when a boolean reduces it to
      // one Path. Bake its own transform into a detached copy first, keeping
      // the original artwork and its enclosing group transforms untouched.
      copy=item.clone({insert:false});copy.applyMatrix=true;
      normalized=copy.unite(copy,{insert:false});
      const paths=normalized instanceof paper.CompoundPath?normalized.children:[normalized];
      const loops=paths.filter(path=>Math.abs(path.area)>1e-7).map(path=>({path,area:Math.abs(path.area),parent:null,depth:0})).sort((a,b)=>b.area-a.area);
      if(!loops.length)throw Error('This path does not enclose a filled area.');
      for(let i=0;i<loops.length;i++){
        const loop=loops[i],inside=loop.path.getPointAt(loop.path.length*.371);
        loop.parent=loops.slice(0,i).filter(other=>other.path.contains(inside)).at(-1)||null;
        loop.depth=loop.parent?loop.parent.depth+1:0;
      }
      const wire=path=>path.curves.map(curve=>{
        if(++count>4000)throw Error('This profile is too complex. Simplify the paths before extruding.');
        const values=curve.values;
        return [0,2,4,6].map(index=>{
          // Boolean results are detached and use their source's parent space.
          // Restore the enclosing groups' transforms before converting to mm.
          let p=path.localToGlobal(new paper.Point(values[index],values[index+1]));
          if(item.parent)p=item.parent.localToGlobal(p);
          return [p.x*MM_PER_PIXEL,-p.y*MM_PER_PIXEL];
        });
      });
      for(const loop of loops.filter(loop=>loop.depth%2===0))profiles.push({outer:wire(loop.path),holes:loops.filter(child=>child.parent===loop&&child.depth%2===1).map(child=>wire(child.path))});
    }finally{normalized?.remove();copy?.remove();}
  }
  items.forEach(add);
  return profiles;
}

export function withoutFeature(model,id){
  // Removing a body also removes its dependent operations, avoiding orphaned
  // targets. Removing a join/cut keeps the body and its later features editable.
  const feature=model.features.find(feature=>feature.id===id);
  return {...model,features:model.features.filter(entry=>entry.id!==id&&!(feature?.operation==='new'&&entry.target===id))};
}
