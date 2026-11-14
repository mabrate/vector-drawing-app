import * as cad from 'replicad';
import {meshComponents} from './model3d-stl.js';

export function stlSolid(feature){
  const {mesh,scale}=feature,components=meshComponents(mesh),garbage=new Set(),keep=value=>{garbage.add(value);return value;};
  try{
    const shells=components.map(triangles=>{
      const faces=triangles.map(indices=>keep(cad.makePolygon(indices.map(index=>mesh.vertices.slice(index*3,index*3+3).map(n=>n*scale)))));
      const sewn=keep(cad.makeSolid(faces)),upgrader=new (cad.getOC()).ShapeUpgrade_UnifySameDomain(sewn.wrapped,true,true,false);
      let shape;
      try{upgrader.Build();shape=keep(cad.cast(upgrader.Shape()));}finally{upgrader.delete();}
      const checker=new (cad.getOC()).BRepCheck_Analyzer(shape.wrapped);
      try{if(!checker.IsValid()||cad.measureVolume(shape)<=1e-7)throw Error('This STL could not be converted to a valid solid. Repair it in the source app and export again.');}finally{checker.delete();}
      const box=shape.boundingBox;try{return {shape,bounds:box.bounds,volume:cad.measureVolume(shape),parent:null};}finally{box.delete();}
    }).sort((a,b)=>b.volume-a.volume);
    // Nested closed shells are voids; disconnected outer shells remain parts.
    // Use the real intersection, not bounding boxes, to decide containment.
    for(let index=0;index<shells.length;index++){
      const child=shells[index];
      for(let other=index-1;other>=0;other--){
        const parent=shells[other];if(!child.bounds[0].every((n,i)=>n>=parent.bounds[0][i]-1e-6&&child.bounds[1][i]<=parent.bounds[1][i]+1e-6))continue;
        const common=keep(child.shape.intersect(parent.shape));
        if(Math.abs(cad.measureVolume(common)-child.volume)<=Math.max(1e-6,child.volume*1e-6)){child.parent=parent;break;}
      }
    }
    const depth=shell=>shell.parent?depth(shell.parent)+1:0,parts=[];
    for(const shell of shells){
      if(depth(shell)%2)continue;
      let part=shell.shape;
      for(const hole of shells.filter(child=>child.parent===shell))part=keep(part.cut(hole.shape));parts.push(part);
    }
    let result=parts[0];for(const part of parts.slice(1))result=keep(result.fuse(part));
    const checker=new (cad.getOC()).BRepCheck_Analyzer(result.wrapped);try{if(!checker.IsValid())throw Error('The STL parts overlap or do not form valid closed solids.');}finally{checker.delete();}
    garbage.delete(result);return result;
  }finally{for(const value of garbage)value.delete();}
}
