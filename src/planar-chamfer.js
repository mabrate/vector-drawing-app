import * as cad from 'replicad';
import {Earcut} from 'three/src/extras/Earcut.js';
import ClipperLib from 'clipper-lib';
import {sampleWire,pointDistance2} from './model3d-contours.js';
import {topology} from './model3d-topology.js';
import {chamferCatalog,selectionContours} from './model3d-chamfer-analysis.js';

export const PLANAR_CHAMFER_TOLERANCE=.02; // millimeters, generated bevel only
const FLATNESS=.002,MAX_FACES=30000;
const length2=(a,b)=>a.reduce((sum,n,i)=>sum+(n-b[i])**2,0);
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

// RDP uses the original samples in every error test; simplification errors do
// not accumulate across removed vertices. Preserve two anchors on a closed ring.
function simplifyContour(points,tolerance){
  if(!tolerance)return points;
  const limit=Math.max(0,tolerance-FLATNESS); // reserve the curve-sampling error
  function part(list){
    let distance=0,index=0;
    for(let i=1;i<list.length-1;i++){const d=pointDistance2(list[i],list[0],list.at(-1));if(d>distance){distance=d;index=i;}}
    if(distance<=limit*limit)return [list[0],list.at(-1)];
    return [...part(list.slice(0,index+1)).slice(0,-1),...part(list.slice(index))];
  }
  let split=1;for(let i=2;i<points.length;i++)if(length2(points[0],points[i])>length2(points[0],points[split]))split=i;
  const simplified=[...part(points.slice(0,split+1)).slice(0,-1),...part([...points.slice(split),points[0]]).slice(0,-1)];
  if(simplified.length<3)throw Error('Preparation would remove this narrow contour. Reduce the preparation tolerance.');
  return simplified;
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

// At a raised design/base junction the bevel adds material outside the design.
// Treat the complete contour as a distance field, rather than asking the CAD
// chamfer builder to propagate through every short edge in an imported STL.
function junctionChamfer(shape,cap,wire,amount,keep,{kind,cleanupTolerance=0}){
  const overlap=FLATNESS*4+cleanupTolerance,scale=1e6,center=keep(cap.center),z=center.z;
  const contour=simplifyContour(sampleWire(wire),cleanupTolerance),origin=contour[0],inside=kind==='cavity-junction',cut=kind==='hole-rim';
  const clean=points=>ClipperLib.Clipper.CleanPolygon(points.map(p=>({X:Math.round(p[0]*scale),Y:Math.round(p[1]*scale)})),250).map(p=>[p.X/scale,p.Y/scale]);
  const path=clean(contour.map(p=>p.map((n,i)=>n-origin[i])));
  if(area(path)<0)path.reverse();
  function offset(distance){
    const builder=new ClipperLib.ClipperOffset(2,FLATNESS/2*scale),result=[];
    builder.AddPath(path.map(p=>({X:Math.round(p[0]*scale),Y:Math.round(p[1]*scale)})),ClipperLib.JoinType.jtRound,ClipperLib.EndType.etClosedPolygon);
    builder.Execute(result,distance*scale);
    if(result.length!==1||result[0].length<3)throw Error('The junction bevel would close or split its contour.');
    return clean(result[0].map(p=>[p.X/scale,p.Y/scale]));
  }
  const depth=amount+2*overlap,roof=bevelRoof(offset(inside?overlap:amount+overlap),offset(inside?-amount-overlap:-overlap),depth),faces=[];
  if(inside)for(const vertex of roof.vertices)vertex.h=depth-vertex.h;
  for(const triangle of roof.triangles)faces.push(keep(polygonFace(triangle.map(i=>[...roof.vertices[i].p,roof.vertices[i].h]))));
  // A hollow belt leaves the raised design and all its internal detail intact.
  const outer=keep(polygonFace(roof.outer.map(p=>[...p,0]))),holeFace=keep(polygonFace(roof.inner.map(p=>[...p,0]))),hole=keep(holeFace.clone().outerWire());
  const bottom=keep(cad.addHolesInFace(outer,[hole]));faces.push(keep(bottom.flipOrientation()));
  const high=inside?roof.outer:roof.inner;
  for(let i=0;i<high.length;i++){
    const a=high[i],b=high[(i+1)%high.length];
    faces.push(keep(polygonFace([[...a,0],[...b,0],[...b,depth],[...a,depth]])));
  }
  let belt=keep(cad.makeSolid(faces).translate([origin[0],origin[1],z-overlap]));
  if(cut)belt=keep(belt.mirror('XY',[0,0,z]));
  // Clip to the supporting base footprint, retaining every other hole. The
  // small intersection below the base surface makes the final union robust.
  const capOuter=keep(cap.clone().outerWire()),capHoles=cap.clone().innerWires();capHoles.forEach(keep);
  const maskFace=keep(cad.makeFace(capOuter,capHoles.filter(h=>!h.isSame(wire)))),base=keep(maskFace.translate([0,0,cut?-depth+overlap:-overlap])),vector=keep(new cad.Vector([0,0,depth]));
  // Near-coplanar triangle cleanup can invalidate this fine bevel. Retain its
  // sewn faces through both booleans and validate the finished solid instead.
  const mask=keep(cad.basicFaceExtrusion(base,vector)),clipped=keep(belt.intersect(mask,{simplify:false}));
  return keep(cut?shape.cut(clipped,{simplify:false}):shape.fuse(clipped,{simplify:false}));
}

function singlePlanarChamfer(shape,keys,amount,signature,{kind,cleanupTolerance=0}){
  const garbage=new Set(),keep=value=>{garbage.add(value);return value;};
  try{
    let cap,outerWire,junction=false;
    const allFaces=topology(shape,'face');allFaces.forEach(keep);
    for(const face of allFaces){
      if(face.geomType!=='PLANE')continue;
      const normal=keep(face.normalAt());if(normal.z<1-1e-8)continue;
      const wire=keep(face.clone().outerWire()),edges=wire.edges;
      try{if(edges.length===keys.size&&edges.every(edge=>keys.has(signature(edge)))){cap=face;outerWire=wire;break;}}
      finally{edges.forEach(edge=>edge.delete());}
      const holes=face.clone().innerWires();holes.forEach(keep);
      for(const hole of holes){const edges=hole.edges;try{if(edges.length===keys.size&&edges.every(edge=>keys.has(signature(edge)))){cap=face;outerWire=hole;junction=true;break;}}finally{edges.forEach(edge=>edge.delete());}}
      if(cap)break;
    }
    if(!cap)throw Error('A planar bevel requires one complete upper outside rim.');
    junction=['raised-junction','cavity-junction'].includes(kind);
    const center=keep(cap.center),z=center.z,filled=keep(cad.makeFace(keep(outerWire.clone())));
    // Keep the bevel within its adjacent walls. Imported junction walls may
    // deviate slightly from vertical, within the contour sampling tolerance.
    for(const face of allFaces){
      if(face===cap)continue;const edges=topology(face,'edge');
      try{
        if(!edges.some(edge=>keys.has(signature(edge))))continue;
        const normal=keep(face.normalAt()),box=keep(face.boundingBox);
        const height=junction?box.bounds[1][2]-z:z-box.bounds[0][2];
        const tilt=Math.abs(normal.z)/normal.Length;
        if(tilt>(junction ? FLATNESS/Math.max(amount,FLATNESS) : 1e-8)||height<amount+FLATNESS*4+cleanupTolerance-1e-7)throw Error('The requested bevel does not fit the adjacent vertical walls.');
      }finally{edges.forEach(edge=>edge.delete());}
    }
    if(junction||kind==='hole-rim'){
      const result=junctionChamfer(shape,cap,outerWire,amount,keep,{kind,cleanupTolerance}),checker=keep(new (cad.getOC()).BRepCheck_Analyzer(result.wrapped));
      if(!checker.IsValid())throw Error('The junction bevel did not produce a valid solid.');
      garbage.delete(result);return result;
    }
    let outer=simplifyContour(sampleWire(outerWire),cleanupTolerance);const origin=outer[0];outer=outer.map(p=>p.map((n,i)=>n-origin[i]));
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
    const overlap=FLATNESS*4+cleanupTolerance,expanded=[];
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

export function planarChamfer(shape,keys,amount,signature,{catalog=chamferCatalog(shape,signature),cleanupTolerance=0}={}){
  const {contours,complete}=selectionContours(catalog,[...keys]);
  if(!complete||contours.some(contour=>contour.side!==1))throw Error('A planar bevel requires one complete upper outside rim or junction contour.');
  let result=shape;
  try{
    for(const contour of contours){
      const next=singlePlanarChamfer(result,new Set(contour.keys),amount,signature,{kind:contour.kind,cleanupTolerance});
      if(result!==shape)result.delete();result=next;
    }
    return result;
  }catch(error){if(result!==shape)result.delete();throw error;}
}
