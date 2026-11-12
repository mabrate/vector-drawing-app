import * as cad from 'replicad';
import {Earcut} from 'three/src/extras/Earcut.js';
import ClipperLib from 'clipper-lib';

export const PLANAR_CHAMFER_TOLERANCE=.02; // millimeters, generated bevel only
const FLATNESS=.002,MAX_FACES=30000;
const length2=(a,b)=>a.reduce((sum,n,i)=>sum+(n-b[i])**2,0);
function pointDistance2(p,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;
  return (p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;
}
const area=points=>points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;
// Improve the constrained ear-clipped mesh without changing boundary edges.
// Flipping only convex pairs preserves holes and gives refinement short,
// well-shaped interior edges instead of accumulating thin transition slivers.
const orient=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
const edgeKey=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
function improveTriangles(triangles,vertices){
  const point=i=>vertices[i].p;
  triangles=triangles.map(([a,b,c])=>orient(point(a),point(b),point(c))<0?[a,c,b]:[a,b,c]);
  for(let pass=0;pass<60;pass++){
    const edges=new Map(),used=new Set();let flips=0;
    for(let t=0;t<triangles.length;t++)for(let i=0;i<3;i++){
      const v=triangles[t],a=v[i],b=v[(i+1)%3],c=v[(i+2)%3],key=edgeKey(a,b),other=edges.get(key);
      if(!other){edges.set(key,{t,a,b,c});continue;}
      if(used.has(t)||used.has(other.t))continue;
      const d=other.c,A=point(a),B=point(b),C=point(c),D=point(d);
      if(orient(C,D,A)*orient(C,D,B)>=0)continue;
      const [ax,ay]=[A[0]-D[0],A[1]-D[1]],[bx,by]=[B[0]-D[0],B[1]-D[1]],[cx,cy]=[C[0]-D[0],C[1]-D[1]];
      const aa=ax*ax+ay*ay,bb=bx*bx+by*by,cc=cx*cx+cy*cy;
      const determinant=aa*(bx*cy-by*cx)-bb*(ax*cy-ay*cx)+cc*(ax*by-ay*bx);
      if(determinant<=1e-12*Math.max(aa,bb,cc)**2)continue;
      const first=[c,d,b],second=[d,c,a];
      if(orient(...first.map(point))<0)first.reverse();
      if(orient(...second.map(point))<0)second.reverse();
      triangles[t]=first;triangles[other.t]=second;used.add(t);used.add(other.t);flips++;
    }
    if(!flips)break;
  }
  return triangles;
}

function sampleWire(wire){
  const edges=wire.edges,remaining=new Set(edges),points=[];
  const pointAt=(edge,t)=>{const p=edge.pointAt(t);try{return p.toTuple().slice(0,2);}finally{p.delete();}};
  function sample(edge,t0,a,t1,b,depth=0){
    const t=(t0+t1)/2,m=pointAt(edge,t);
    if(depth<16&&((edge.geomType!=='LINE'&&Math.abs(t1-t0)>1/4)||pointDistance2(m,a,b)>FLATNESS**2)){
      sample(edge,t0,a,t,m,depth+1);sample(edge,t,m,t1,b,depth+1);
    }else points.push(b);
    if(points.length>10000)throw Error('The contour is too complex for a planar bevel.');
  }
  try{
    let end=null;
    while(remaining.size){
      let chosen,reverse=false,start,finish;
      for(const edge of remaining){
        const a=pointAt(edge,0),b=pointAt(edge,1);
        if(!end||length2(end,a)<1e-10){chosen=edge;start=a;finish=b;break;}
        if(length2(end,b)<1e-10){chosen=edge;reverse=true;start=b;finish=a;break;}
      }
      if(!chosen)throw Error('The selected contour is not a closed loop.');
      remaining.delete(chosen);if(!points.length)points.push(start);
      sample(chosen,reverse?1:0,start,reverse?0:1,finish);end=finish;
    }
    if(length2(points[0],points.at(-1))>1e-10)throw Error('The selected contour is not closed.');
    points.pop();
    return points.filter((p,i)=>length2(p,points[(i+points.length-1)%points.length])>1e-16);
  }finally{edges.forEach(edge=>edge.delete());}
}

// A distance-field roof over the entire inset ring avoids fitting a separate
// chamfer to every tiny CAD edge. Constrained edge flips and interior refinement
// preserve a joined mesh while checking the 45-degree section in millimeters.
export function bevelRoof(outer,inner,amount){
  if(area(outer)<0)outer=[...outer].reverse();
  if(area(inner)>0)inner=[...inner].reverse();
  const vertices=[...outer.map(p=>({p,h:0})),...inner.map(p=>({p,h:amount}))];
  const coords=vertices.flatMap(v=>v.p),indices=Earcut.triangulate(coords,[outer.length],2);
  let triangles=Array.from({length:indices.length/3},(_,i)=>indices.slice(i*3,i*3+3));
  function height(p){let d=Infinity;for(let i=0;i<outer.length;i++)d=Math.min(d,pointDistance2(p,outer[i],outer[(i+1)%outer.length]));return Math.min(amount,Math.sqrt(d));}
  let converged=false;
  for(let pass=0;pass<18;pass++){
    triangles=improveTriangles(triangles,vertices);
    const next=[];let added=0;
    for(const triangle of triangles){
      const center=[0,1].map(j=>triangle.reduce((s,i)=>s+vertices[i].p[j],0)/3),h=triangle.reduce((s,i)=>s+vertices[i].h,0)/3;
      let error=Math.abs(height(center)-h);
      for(let i=0;i<3;i++){
        const a=vertices[triangle[i]],b=vertices[triangle[(i+1)%3]],p=a.p.map((n,j)=>(n+b.p[j])/2);
        error=Math.max(error,Math.abs(height(p)-(a.h+b.h)/2));
      }
      if(error<=PLANAR_CHAMFER_TOLERANCE/2){next.push(triangle);continue;}
      const id=vertices.length;vertices.push({p:center,h:height(center)});
      const [a,b,c]=triangle;next.push([a,b,id],[b,c,id],[c,a,id]);added++;
    }
    if(!added){converged=true;break;}
    triangles=next;
    if(triangles.length>MAX_FACES)throw Error('The planar bevel exceeds its precision limit.');
  }
  if(!converged)throw Error('The planar bevel could not meet its precision limit.');
  return {vertices,triangles,outer,inner};
}

function polygonFace(points,up=true){
  const edges=points.map((p,i)=>cad.makeLine(p,points[(i+1)%points.length]));
  let wire;
  try{
    wire=cad.assembleWire(edges);let face=cad.makeFace(wire),normal=face.normalAt();
    try{if((normal.z>0)!==up){const flipped=face.flipOrientation();face.delete();face=flipped;}}finally{normal.delete();}
    return face;
  }finally{wire?.delete();edges.forEach(edge=>edge.delete());}
}

export function planarChamfer(shape,keys,amount,signature){
  const garbage=new Set(),keep=value=>{garbage.add(value);return value;};
  try{
    let cap,outerWire;
    const allFaces=shape.faces;allFaces.forEach(keep);
    for(const face of allFaces){
      if(face.geomType!=='PLANE')continue;
      const normal=keep(face.normalAt());if(normal.z<1-1e-8)continue;
      const wire=keep(face.clone().outerWire()),edges=wire.edges;
      try{if(edges.length===keys.size&&edges.every(edge=>keys.has(signature(edge)))){cap=face;outerWire=wire;break;}}
      finally{edges.forEach(edge=>edge.delete());}
    }
    if(!cap)throw Error('A planar bevel requires one complete upper outside rim.');
    const center=keep(cap.center),z=center.z,filled=keep(cad.makeFace(keep(outerWire.clone())));
    // This fallback supports a complete cap on straight, vertical walls. Do
    // not let a bevel extend down through a lower junction or a drafted wall.
    for(const face of allFaces){
      if(face===cap)continue;const edges=face.edges;
      try{
        if(!edges.some(edge=>keys.has(signature(edge))))continue;
        const normal=keep(face.normalAt()),box=keep(face.boundingBox);
        if(Math.abs(normal.z)>1e-8||z-box.bounds[0][2]<amount+FLATNESS*4-1e-7)throw Error('The requested bevel does not fit the adjacent vertical walls.');
      }finally{edges.forEach(edge=>edge.delete());}
    }
    let outer=sampleWire(outerWire);const origin=outer[0];outer=outer.map(p=>p.map((n,i)=>n-origin[i]));
    const clean=points=>ClipperLib.Clipper.CleanPolygon(points.map(p=>({X:Math.round(p[0]*1e6),Y:Math.round(p[1]*1e6)})),250).map(p=>[p.X/1e6,p.Y/1e6]);
    outer=clean(outer);
    if(area(outer)<0)outer.reverse();
    const scale=1e6,offset=new ClipperLib.ClipperOffset(2,FLATNESS/2*scale),solution=[];
    offset.AddPath(outer.map(p=>({X:Math.round(p[0]*scale),Y:Math.round(p[1]*scale)})),ClipperLib.JoinType.jtRound,ClipperLib.EndType.etClosedPolygon);
    offset.Execute(solution,-amount*scale);
    if(solution.length!==1||solution[0].length<3)throw Error('The requested inset does not leave one closed upper face.');
    const inner=clean(solution[0].map(p=>[p.X/scale,p.Y/scale]));
    // Start just outside/below the original rim. The two offsets cancel in
    // the 45-degree section, while avoiding coincident curve/polyline slivers.
    const overlap=FLATNESS*4,expanded=[];
    const expand=new ClipperLib.ClipperOffset(2,FLATNESS/2*scale);
    expand.AddPath(outer.map(p=>({X:Math.round(p[0]*scale),Y:Math.round(p[1]*scale)})),ClipperLib.JoinType.jtRound,ClipperLib.EndType.etClosedPolygon);
    expand.Execute(expanded,overlap*scale);
    if(expanded.length!==1)throw Error('The outside contour could not be prepared.');
    outer=clean(expanded[0].map(p=>[p.X/scale,p.Y/scale]));
    const depth=amount+overlap,roof=bevelRoof(outer,inner,depth),faces=[];
    for(const triangle of roof.triangles){
      let points=triangle.map(i=>[...roof.vertices[i].p,roof.vertices[i].h]);
      const [a,b,c]=points;if((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])<0)points=[a,c,b];
      faces.push(keep(polygonFace(points)));
    }
    faces.push(keep(polygonFace(roof.outer.map(p=>[...p,0]),false)),keep(polygonFace(roof.inner.map(p=>[...p,depth]))));
    const belt=keep(cad.makeSolid(faces).translate([origin[0],origin[1],z-depth]));
    const vector=keep(new cad.Vector([0,0,-depth])),slab=keep(cad.basicFaceExtrusion(filled,vector));
    const lower=keep(shape.cut(slab)),upper=keep(shape.intersect(belt)),result=keep(lower.fuse(upper));
    const checker=keep(new (cad.getOC()).BRepCheck_Analyzer(result.wrapped));
    if(!checker.IsValid())throw Error('The planar bevel did not produce a valid solid.');
    garbage.delete(result);return result;
  }finally{for(const value of garbage)value.delete();}
}
