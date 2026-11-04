import ClipperLib from 'clipper-lib';
const SCALE=1000,EPS=1e-8,MAX_POINTS=200000;

export function canConvertStroke(paper,item){
 return item instanceof paper.PathItem&&item.strokeColor?.alpha>0&&Number.isFinite(item.strokeWidth)&&item.strokeWidth>0;
}

// Work in the stroke's coordinate space, then transform the finished fill.
// This preserves nonuniform scaling and skew, including elliptical round caps.
export function strokeToPath(paper,item){
 if(!canConvertStroke(paper,item))throw Error('Select vector paths with a visible stroke.');
 const radius=item.strokeWidth/2,polygons=[];let pointCount=0;
 const world=item.strokeScaling===false,space=world?item.globalMatrix:new paper.Matrix();
 const scale=Math.max(1,item.globalMatrix.getScaling().length),tolerance=.04/(world?1:scale);
 function polygon(points){
  const contour=points.map(p=>({X:Math.round(p.x*SCALE),Y:Math.round(p.y*SCALE)}));
  pointCount+=contour.length;if(pointCount>MAX_POINTS)throw Error('This stroke is too complex to convert. Try a simpler path.');
  if(contour.length>=3){if(!ClipperLib.Clipper.Orientation(contour))contour.reverse();polygons.push(contour);}
 }
 function disk(p){
  const steps=Math.min(256,Math.max(12,Math.ceil(Math.PI/Math.acos(Math.max(-1,1-Math.min(tolerance,radius/4)/radius))/4)*4));
  polygon(Array.from({length:steps},(_,i)=>p.add(new paper.Point({length:radius,angle:i*360/steps}))));
 }
 // Offset each connected centerline as a continuous boundary. Unioning one
 // rectangle per flattened segment leaves subpixel cracks at quantized joins.
 const strokeOffset=new ClipperLib.ClipperOffset(Math.max(1,item.miterLimit||10),tolerance*SCALE);
 const square=strokeOffset.DoSquare,miter=strokeOffset.DoMiter;
 // Clipper 6.4.2 uses square joins for both bevels and miter-limit fallbacks.
 // SVG bevels connect the two offset endpoints directly. Keep its square-cap
 // construction (opposed normals), while adapting only the corner joins.
 strokeOffset.DoSquare=function(j,k){
  const a=this.m_normals[k],b=this.m_normals[j];
  if(a.X*b.X+a.Y*b.Y<-1+EPS&&Math.abs(this.m_sinA)<EPS)return square.call(this,j,k);
  const p=this.m_srcPoly[j];
  for(const n of [a,b])this.m_destPoly.push({X:Math.round(p.X+n.X*this.m_delta),Y:Math.round(p.Y+n.Y*this.m_delta)});
 };
 strokeOffset.DoMiter=function(j,k,r){
  if(Math.sqrt(2/r)>Math.max(1,item.miterLimit||10)+EPS)this.DoSquare(j,k);
  else miter.call(this,j,k,r);
 };
 function outline(points,closed=false,direction=new paper.Point(1,0)){
  points=points.filter((p,i)=>!i||p.getDistance(points[i-1])>EPS);
  if(closed&&points.length>1&&points[0].getDistance(points.at(-1))<EPS)points.pop();
  if(points.length<2){
   if(points.length&&item.strokeCap==='round')disk(points[0]);
   else if(points.length&&item.strokeCap==='square'){const u=direction.normalize(radius),n=u.rotate(90),p=points[0];polygon([p.add(u).add(n),p.subtract(u).add(n),p.subtract(u).subtract(n),p.add(u).subtract(n)]);}
   return;
  }
  pointCount+=points.length;if(pointCount>MAX_POINTS)throw Error('This stroke is too complex to convert. Try a simpler path.');
  const contour=points.map(p=>({X:Math.round(p.x*SCALE),Y:Math.round(p.y*SCALE)}));
  const joins={round:ClipperLib.JoinType.jtRound,miter:ClipperLib.JoinType.jtMiter,bevel:ClipperLib.JoinType.jtSquare};
  const caps={butt:ClipperLib.EndType.etOpenButt,round:ClipperLib.EndType.etOpenButt,square:ClipperLib.EndType.etOpenSquare};
  strokeOffset.AddPath(contour,joins[item.strokeJoin]??joins.miter,closed?ClipperLib.EndType.etClosedLine:(caps[item.strokeCap]??caps.butt));
  // Cardinal vertices keep round-cap bounds exact instead of shrinking them
  // by the arc approximation tolerance. The disks overlap the butt outline.
  if(!closed&&item.strokeCap==='round'){disk(points[0]);disk(points.at(-1));}
 }
 function dashed(points,closed){
  let pattern=[...(item.dashArray||[])];
  if(pattern.some(v=>!Number.isFinite(v)||v<0))throw Error('This stroke has an invalid dash pattern.');
  if(pattern.length%2)pattern=pattern.concat(pattern);
  const period=pattern.reduce((a,b)=>a+b,0);
  if(!period){outline(points,closed);return;}
  if(closed)points=[...points,points[0]];
  const edges=[],lengths=[0];
  for(let i=1;i<points.length;i++){const length=points[i].getDistance(points[i-1]);if(length>EPS){edges.push({a:points[i-1],b:points[i],start:lengths.at(-1),length});lengths.push(lengths.at(-1)+length);}}
  if(!edges.length){outline(points);return;}
  const total=lengths.at(-1),pieces=[];
  let index=0,offset=((item.dashOffset||0)%period+period)%period,steps=0;
  while(offset>EPS||pattern[index]===0){if(pattern[index]>offset+EPS)break;offset-=pattern[index];index=(index+1)%pattern.length;if(++steps>pattern.length*2)break;}
  // Include a zero-length painted dash at the origin (dotted strokes).
  if(Math.abs((item.dashOffset||0)%period)<EPS&&pattern[0]===0){index=0;offset=0;}
  function edgeAt(value){
   let lo=0,hi=edges.length-1;
   while(lo<hi){const mid=(lo+hi)>>1;if(edges[mid].start+edges[mid].length<value-EPS)lo=mid+1;else hi=mid;}
   return lo;
  }
  const at=value=>{const edge=edges[edgeAt(value)];return edge.a.add(edge.b.subtract(edge.a).multiply(Math.max(0,Math.min(1,(value-edge.start)/edge.length))));};
  let position=-offset;
  while(position<=total+EPS){
   if(++steps>50000)throw Error('This stroke has too many dashes to convert.');
   const end=position+pattern[index];
   if(index%2===0&&end>=-EPS&&position<=total+EPS){
    const start=Math.max(0,position),stop=Math.min(total,end);
    const begin=edgeAt(start),endIndex=edgeAt(stop),pts=[at(start),...edges.slice(begin+1,endIndex+1).filter(e=>e.start<stop-EPS).map(e=>e.a),at(stop)];
    const edge=edges[begin];
    pieces.push({points:pts,start,stop,direction:edge.b.subtract(edge.a)});
   }
   position=end;index=(index+1)%pattern.length;
  }
  // A dash crossing a closed seam has a join there, rather than two caps.
  if(closed&&pieces.length>1&&pieces[0].start<EPS&&pieces.at(-1).stop>=total-EPS){const first=pieces.shift(),last=pieces.pop();pieces.unshift({points:[...last.points,...first.points.slice(1)],start:last.start,stop:first.stop,direction:last.direction});}
  for(const piece of pieces)outline(piece.points,closed&&pieces.length===1&&piece.start===0&&piece.stop===total,piece.direction);
 }
 const sources=item instanceof paper.CompoundPath?item.children:[item];
  for(const source of sources){
   const copy=source.clone({insert:false});
   try{
    copy.applyMatrix=false;copy.matrix=space.appended(item.globalMatrix.inverted().append(source.globalMatrix));copy.applyMatrix=true;copy.flatten(tolerance);
    if(copy.segments.length>50000)throw Error('This stroke is too complex to convert.');
    dashed(copy.segments.map(s=>s.point.clone()),copy.closed);
   }finally{copy.remove();}
  }
  const borders=[];strokeOffset.Execute(borders,radius*SCALE);
  if(borders.reduce((n,p)=>n+p.length,0)+pointCount>MAX_POINTS)throw Error('This stroke is too complex to convert. Try a simpler path.');
  polygons.push(...borders);
  if(!polygons.length)throw Error('This stroke has no visible area to convert.');
  const clipper=new ClipperLib.Clipper(),solution=[];clipper.AddPaths(polygons,ClipperLib.PolyType.ptSubject,true);
  clipper.Execute(ClipperLib.ClipType.ctUnion,solution,ClipperLib.PolyFillType.pftNonZero,ClipperLib.PolyFillType.pftNonZero);
  if(!solution.length)throw Error('This stroke has no visible area to convert.');
  const paths=solution.map(points=>new paper.Path({segments:points.map(p=>[p.X/SCALE,p.Y/SCALE]),closed:true,insert:false}));
  const result=paths.length===1?paths[0]:new paper.CompoundPath({children:paths,insert:false});
  if(world)result.transform(item.globalMatrix.inverted());
  result.fillColor=item.strokeColor.clone();result.strokeColor=null;result.fillRule='nonzero';
  let output=result;
  if(item.fillColor?.alpha>0){
   const fill=item.clone({insert:false});fill.applyMatrix=false;fill.matrix.reset();fill.strokeColor=null;fill.opacity=1;fill.blendMode='normal';fill.data={};for(const child of fill.children||[])child.data={};
   output=new paper.Group({children:[fill,result],insert:false,applyMatrix:false});output.data.objectGroup=true;
  }
  output.applyMatrix=false;output.matrix=item.matrix.clone();output.opacity=item.opacity;output.visible=item.visible;output.blendMode=item.blendMode;
  return output;
}
