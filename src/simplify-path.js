import paper from 'paper';

function retainClosedMinimum(path){
 const modes=new Map(path.segments.map(s=>[s,path.data.nodeModes?.[s.index]]));
 while(path.segments.length<3){
  const curve=path.curves.reduce((longest,c)=>!longest||c.length>longest.length?c:longest,null);
  if(!curve||curve.length<1e-8)return false;
  // A closed two-anchor Bézier loop is valid. Subdividing a curve keeps
  // its exact shape while retaining the editor's three-node minimum.
  if(!curve.divideAtTime(.5))return false;
 }
 path.data.nodeModes=Object.fromEntries(path.segments.map((s,i)=>[i,modes.get(s)||(s.isSmooth()?'round':'corner')]));return true;
}

function isCorner(path,index){
 const node=path.segments[index],mode=path.data.nodeModes?.[index];
 if(mode==='corner')return true;
 if(mode==='round'||mode==='symmetric'||!node.previous||!node.next)return false;
 const incoming=node.previous.curve.getTangentAtTime(1),outgoing=node.curve.getTangentAtTime(0);
 // Dense imported/traced outlines often approximate a curve with many small
 // bends. Keep substantial turns, rather than treating every bend as a pin.
 return incoming?.length&&outgoing?.length&&incoming.normalize().dot(outgoing.normalize())<Math.cos(Math.PI/6);
}

// Fit smooth spans separately so a fit can never replace a corner with a
// smooth join, or drop an explicitly independent node that looks smooth.
export function simplifyPath(path,tolerance){
 const copy=path.clone({insert:false}),nodes=path.segments,n=nodes.length;
 if(tolerance<=0||n<=2)return copy;
 const corners=nodes.map((_,i)=>i).filter(i=>isCorner(path,i)),cornerSet=new Set(corners),modes=path.data.nodeModes||{},key=p=>`${p.x},${p.y}`;
 const artificial=[];
 if(path.closed&&!corners.length){
  // Fit two open halves of a smooth loop. Paper's closed-path fitter can
  // discard most of the loop when a large tolerance produces too few nodes.
  let farthest=1;for(let i=2;i<n;i++)if(nodes[i].point.getDistance(nodes[0].point)>nodes[farthest].point.getDistance(nodes[0].point))farthest=i;
  artificial.push(0,farthest);
 }
 const breaks=path.closed?(corners.length?corners:artificial):[...new Set([0,...corners,n-1])].sort((a,b)=>a-b),result=[],resultModes=[];
 for(let part=0;part<(path.closed?breaks.length:breaks.length-1);part++){
  const start=breaks[part],end=breaks[(part+1)%breaks.length],indices=[start];
  for(let i=(start+1)%n;i!==end;i=(i+1)%n)indices.push(i);
  indices.push(end);
  const span=new paper.Path({insert:false,segments:indices.map(i=>nodes[i].clone())});
  try{
   const first=span.firstCurve.getTangentAtTime(0),last=span.lastCurve.getTangentAtTime(1),original=span.segments.map(s=>s.clone());
   if(original.length>2){
    // Paper's fitter compares squared distances; tolerance is in pixels.
    span.simplify(tolerance*tolerance);
    if(span.segments.length<2||span.segments.length>=original.length){span.removeSegments();span.addSegments(original);}
    else{
     // Preserve the direction on each side of a sharp join, even when the
     // original endpoint had a zero-length handle along a straight edge.
     if(first?.length)span.firstSegment.handleOut=first.normalize(span.firstSegment.handleOut.length);
     if(last?.length)span.lastSegment.handleIn=last.normalize(-span.lastSegment.handleIn.length);
    }
   }
   const originalModes=new Map(indices.map(i=>[key(nodes[i].point),modes[i]]));
   const partModes=span.segments.map(s=>originalModes.get(key(s.point))||(s.isSmooth()?'round':'corner'));
   if(cornerSet.has(start))partModes[0]='corner';if(cornerSet.has(end))partModes[partModes.length-1]='corner';
   const segments=span.segments.map(s=>s.clone());
   if(result.length){result.at(-1).handleOut=segments[0].handleOut;segments.shift();partModes.shift();}
   result.push(...segments);resultModes.push(...partModes);
  }finally{span.remove();}
 }
 if(path.closed){result[0].handleIn=result.pop().handleIn;resultModes.pop();}
 else{result[0].handleIn=nodes[0].handleIn;result.at(-1).handleOut=nodes[n-1].handleOut;}
 if(result.length>=n||result.length<(path.closed?1:2))return copy;
 for(const index of artificial){
  const segment=result.find(s=>s.point.equals(nodes[index].point));if(!segment)continue;
  const incoming=nodes[index].previous.curve.getTangentAtTime(1),outgoing=nodes[index].curve.getTangentAtTime(0);if(!incoming?.length||!outgoing?.length)continue;
  const direction=incoming.normalize().add(outgoing.normalize());
  if(direction.length){segment.handleIn=direction.normalize(-segment.handleIn.length);segment.handleOut=direction.normalize(segment.handleOut.length);resultModes[result.indexOf(segment)]='round';}
 }
 copy.removeSegments();copy.addSegments(result);copy.closed=path.closed;copy.data.nodeModes=Object.fromEntries(resultModes.map((mode,i)=>[i,mode]));
 if(path.closed&&(!retainClosedMinimum(copy)||copy.segments.length>=n)){copy.remove();return path.clone({insert:false});}
 return copy;
}
