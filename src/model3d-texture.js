import * as cad from 'replicad';
import {MAX_TEXTURE_ELEMENTS} from './model3d-data.js';
const dot=(a,b)=>a.reduce((sum,n,i)=>sum+n*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const length=Math.hypot(...a);return a.map(n=>n/length);};

export function textureSolid(shape,feature,signature){
  const garbage=new Set(),keep=value=>{garbage.add(value);return value;},allFaces=shape.faces,wanted=new Set(feature.faces),selected=allFaces.filter(face=>wanted.has(signature(face)));
  try{
    if(selected.length!==wanted.size)throw Error('A selected texture face changed. Edit this texture and select its surfaces again.');
    if(selected.some(face=>face.geomType!=='PLANE'))throw Error('Printable textures currently require flat faces. Select a planar surface.');
    let elements=0,tool=null;
    for(const face of selected){
      const normal=keep(face.normalAt()),center=keep(face.center),n=unit(normal.toTuple()),origin=center.toTuple();
      const baseU=unit(cross(Math.abs(n[2])<.9?[0,0,1]:[0,1,0],n)),baseV=cross(n,baseU),angle=feature.angle*Math.PI/180;
      const u=baseU.map((a,i)=>a*Math.cos(angle)+baseV[i]*Math.sin(angle)),v=baseV.map((a,i)=>-a*Math.sin(angle)+baseV[i]*Math.cos(angle));
      const at=(x,y,z=0)=>origin.map((a,i)=>a+u[i]*x+v[i]*y+n[i]*z),box=face.boundingBox;
      let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
      try{const [min,max]=box.bounds;for(const x of [min[0],max[0]])for(const y of [min[1],max[1]])for(const z of [min[2],max[2]]){const relative=[x,y,z].map((a,i)=>a-origin[i]),a=dot(relative,u),b=dot(relative,v);minU=Math.min(minU,a);maxU=Math.max(maxU,a);minV=Math.min(minV,b);maxV=Math.max(maxV,b);}}finally{box.delete();}
      const pitch=feature.spacing,r=feature.width/2,eps=Math.min(.01,feature.depth/10),bottom=feature.mode==='raised'?-eps:-feature.depth,travel=feature.depth+eps;
      const firstU=Math.ceil((minU-r)/pitch),lastU=Math.floor((maxU+r)/pitch),firstV=Math.ceil((minV-r)/pitch),lastV=Math.floor((maxV+r)/pitch);
      const count=(lastU-firstU+1)*(feature.pattern==='ribs'?1:lastV-firstV+1);elements+=count;
      if(!Number.isFinite(count)||count<1||elements>MAX_TEXTURE_ELEMENTS)throw Error(`This texture would exceed ${MAX_TEXTURE_ELEMENTS} elements. Increase spacing, or select fewer/smaller faces.`);
      const pieces=[],vector=keep(new cad.Vector(n.map(a=>a*travel)));
      function square(x0,y0,x1,y1){const polygon=keep(cad.makePolygon([[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(([x,y])=>at(x,y,bottom))));return keep(cad.basicFaceExtrusion(polygon,vector));}
      for(let i=firstU;i<=lastU;i++){
        const x=i*pitch;
        if(feature.pattern==='ribs'){pieces.push(square(x-r,minV-eps,x+r,maxV+eps));continue;}
        for(let j=firstV;j<=lastV;j++){const y=j*pitch;pieces.push(feature.pattern==='dots'?keep(cad.makeCylinder(r,travel,at(x,y,bottom),n)):square(x-r,y-r,x+r,y+r));}
      }
      const combined=keep(cad.makeCompound(pieces.map(piece=>piece.clone()))),base=keep(face.clone().translate(n.map(a=>a*bottom))),mask=keep(cad.basicFaceExtrusion(base,vector));
      const clipped=keep(combined.intersect(mask));
      if(cad.measureVolume(clipped)<=1e-8)continue;
      tool=tool?keep(tool.fuse(clipped)):clipped;
    }
    if(!tool)throw Error('The pattern does not reach these faces. Reduce its spacing or change its angle.');
    const result=keep(feature.mode==='raised'?shape.fuse(tool):shape.cut(tool)),checker=new (cad.getOC()).BRepCheck_Analyzer(result.wrapped);
    try{if(!checker.IsValid()||cad.measureVolume(result)<=1e-7)throw Error('This texture leaves invalid geometry. Reduce its depth, width, or density.');}finally{checker.delete();}
    garbage.delete(result);return result;
  }finally{allFaces.forEach(face=>face.delete());for(const value of garbage)value.delete();}
}
