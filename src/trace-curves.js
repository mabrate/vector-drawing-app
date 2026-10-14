function area(points){return points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;}

// Canonical orientation and starting point give opposite sides of a shared
// color boundary the same simplification, rather than independent seams.
export function canonicalContour(points){
  const reversed=area(points)<0,ordered=reversed?points.slice().reverse():points.slice();let start=0;
  for(let i=1;i<ordered.length;i++)if(ordered[i][1]<ordered[start][1]||ordered[i][1]===ordered[start][1]&&ordered[i][0]<ordered[start][0])start=i;
  return {points:[...ordered.slice(start),...ordered.slice(0,start)],reversed};
}

export function smoothContour(points,amount,closed=true){
  if(amount<=0||points.length<16)return points;
  const n=points.length,radius=Math.max(1,Math.round(amount/100*3)),look=Math.min(8,Math.floor(n/32)),mix=amount/100;
  return points.map((p,i)=>{
    const at=index=>points[closed?(index+n)%n:Math.max(0,Math.min(n-1,index))];
    if(!closed&&(i===0||i===n-1))return p;
    const before=at(i-look),after=at(i+look),a=[p[0]-before[0],p[1]-before[1]],b=[after[0]-p[0],after[1]-p[1]],length=Math.hypot(...a)*Math.hypot(...b);
    // Preserve deliberate corners and short features. Average the staircase
    // only where the contour keeps moving in approximately the same direction.
    if(!length||(a[0]*b[0]+a[1]*b[1])/length<Math.cos(Math.PI/3))return p;
    let x=0,y=0,total=0;
    for(let offset=-radius;offset<=radius;offset++){const q=at(i+offset),weight=radius+1-Math.abs(offset);x+=q[0]*weight;y+=q[1]*weight;total+=weight;}
    return [Number((p[0]*(1-mix)+x/total*mix).toFixed(6)),Number((p[1]*(1-mix)+y/total*mix).toFixed(6))];
  });
}

export function curveSegments(points,amount,closed=true,source=points){
  const strength=Math.min(1,amount/50),lookup=new Map(source.map((p,i)=>[p,i]));
  return points.map((p,i)=>{
    if(!closed&&(i===0||i===points.length-1))return [p,[0,0],[0,0]];
    const previous=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length],la=Math.hypot(p[0]-previous[0],p[1]-previous[1]),lb=Math.hypot(next[0]-p[0],next[1]-p[1]);
    // Estimate the tangent from the original contour, not the unevenly spaced
    // simplified anchors. Different incoming/outgoing lengths must not tilt it.
    const index=lookup.get(p),look=Math.max(3,Math.min(8,Math.floor(source.length/24))),at=j=>source[closed?(j+source.length)%source.length:Math.max(0,Math.min(source.length-1,j))];
    const before=index===undefined?previous:at(index-look),after=index===undefined?next:at(index+look),a=[p[0]-before[0],p[1]-before[1]],b=[after[0]-p[0],after[1]-p[1]],al=Math.hypot(...a),bl=Math.hypot(...b),cos=al&&bl?(a[0]*b[0]+a[1]*b[1])/(al*bl):-1;
    if(!strength||cos<Math.cos(Math.PI*5/12)||!la||!lb)return [p,[0,0],[0,0]];
    const direction=a.map((v,c)=>v/al+b[c]/bl),length=Math.hypot(...direction);
    if(!length)return [p,[0,0],[0,0]];
    return [p,direction.map(v=>-v/length*la/3*strength),direction.map(v=>v/length*lb/3*strength)];
  });
}

// A junction splits a contour into shared open arcs. Each arc is smoothed in
// one deterministic direction, so adjoining colors meet exactly, even when
// they share only part of their outlines.
export function prepareContour(points,labels,width,height,amount){
  function isJunction([x,y]){
    const colors=new Set();for(const yy of [y-1,y])for(const xx of [x-1,x])colors.add(xx<0||xx>=width||yy<0||yy>=height?-1:labels[yy*width+xx]);
    return colors.size>=3;
  }
  const anchors=[];points.forEach((p,i)=>{if(isJunction(p))anchors.push(i);});
  if(!anchors.length){const canonical=canonicalContour(points);return {closed:true,reversed:canonical.reversed,points:smoothContour(canonical.points,amount)};}
  if(anchors.length===1){let best=-1,split=0;const a=points[anchors[0]];for(let i=0;i<points.length;i++){const d=(points[i][0]-a[0])**2+(points[i][1]-a[1])**2;if(d>best){best=d;split=i;}}anchors.push(split);anchors.sort((a,b)=>a-b);}
  const arcs=anchors.map((start,index)=>{
    const end=anchors[(index+1)%anchors.length],arc=[];for(let i=start;;i=(i+1)%points.length){arc.push(points[i]);if(i===end)break;}
    const a=arc[0],b=arc.at(-1),reversed=a[1]>b[1]||a[1]===b[1]&&a[0]>b[0];
    return {reversed,points:smoothContour(reversed?arc.reverse():arc,amount,false)};
  });
  return {closed:false,arcs};
}

export function fitContour(prepared,tolerance,amount,simplifyClosed,simplifyChain){
  if(prepared.closed){let points=simplifyClosed(prepared.points,tolerance);if(prepared.reversed)points=[points[0],...points.slice(1).reverse()];return {points,segments:curveSegments(points,amount,true,prepared.reversed?prepared.points.slice().reverse():prepared.points)};}
  const segments=[];
  for(const arc of prepared.arcs){const points=simplifyChain(arc.points,tolerance);let fitted=curveSegments(points,amount,false,arc.points);if(arc.reversed)fitted=fitted.reverse().map(([p,into,out])=>[p,out,into]);segments.push(...fitted.slice(0,-1));}
  return {points:segments.map(s=>s[0]),segments};
}
