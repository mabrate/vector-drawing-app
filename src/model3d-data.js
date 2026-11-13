// The portable recipe is independent of Paper.js and the CAD kernel. All model
// coordinates and distances are millimeters; the drawing uses 96 px per inch.
export const MM_PER_PIXEL=25.4/96;
export const MAX_TREATMENT_EDGES=4000;
export const MAX_SHELL_FACES=1000;
export const emptyModel=()=>({version:1,features:[]});
const finite=(value,limit=100000)=>typeof value==='number'&&Number.isFinite(value)&&Math.abs(value)<=limit;
const point=value=>Array.isArray(value)&&value.length===2&&value.every(n=>finite(n));
const identifier=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value);

export function validModel(model){
  if(!model||model.version!==1||!Array.isArray(model.features)||model.features.length>100)return false;
  const ids=new Set(),bodies=new Set();let curves=0,edges=0;
  const wire=value=>Array.isArray(value)&&value.length>0&&value.length<=2000&&value.every(curve=>{
    curves++;return Array.isArray(curve)&&curve.length===4&&curve.every(point);
  });
  for(const feature of model.features){
    if(!feature||!identifier(feature.id)||ids.has(feature.id)||typeof feature.name!=='string'||feature.name.length>100)return false;
    ids.add(feature.id);
    if(feature.kind==='extrusion'){
      if(!['new','join','cut'].includes(feature.operation)||!finite(feature.height,10000)||feature.height<=0||!finite(feature.start,10000)||!finite(feature.draft,60))return false;
      if(feature.operation==='new'){if(feature.target!==null)return false;bodies.add(feature.id);}
      else if(!bodies.has(feature.target))return false;
      if(!Array.isArray(feature.profile)||!feature.profile.length||feature.profile.length>100||!feature.profile.every(face=>face&&wire(face.outer)&&Array.isArray(face.holes)&&face.holes.length<=100&&face.holes.every(wire)))return false;
    }else if(feature.kind==='shell'){
      if(!bodies.has(feature.target)||!finite(feature.thickness,1000)||feature.thickness<=0||!['inside','outside'].includes(feature.direction)||!Array.isArray(feature.faces)||!feature.faces.length||feature.faces.length>MAX_SHELL_FACES||new Set(feature.faces).size!==feature.faces.length||!feature.faces.every(face=>typeof face==='string'&&face.length>0&&face.length<=300))return false;
    }else if(['chamfer','fillet'].includes(feature.kind)){
      if(!bodies.has(feature.target)||!finite(feature.amount,1000)||feature.amount<=0||!Array.isArray(feature.edges)||!feature.edges.length||feature.edges.length>MAX_TREATMENT_EDGES||!feature.edges.every(edge=>typeof edge==='string'&&edge.length<=300))return false;
      edges+=feature.edges.length;
    }else return false;
  }
  return curves<=4000&&edges<=12000;
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
    let normalized;
    try{
      normalized=item.unite(item,{insert:false});
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
          const p=path.localToGlobal(new paper.Point(values[index],values[index+1]));
          return [p.x*MM_PER_PIXEL,-p.y*MM_PER_PIXEL];
        });
      });
      for(const loop of loops.filter(loop=>loop.depth%2===0))profiles.push({outer:wire(loop.path),holes:loops.filter(child=>child.parent===loop&&child.depth%2===1).map(child=>wire(child.path))});
    }finally{normalized?.remove();}
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
