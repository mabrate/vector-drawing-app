// Rank what is nearest to the pointer in CSS pixels, independently of zoom.
// The viewer checks occlusion before accepting a candidate. Recognized rims get
// a small preference in whole-boundary mode; individual mode remains literal.
export function screenEdgeCandidates(segments,point,{radius=12,preferBoundaries=true}={}){
  const nearest=new Map();
  for(const segment of segments){
    const {a,b}=segment;if(a.w<=0||b.w<=0||a.z>1&&b.z>1||a.z< -1&&b.z< -1)continue;
    const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/length)):0;
    const x=a.x+t*dx,y=a.y+t*dy,distance=Math.hypot(point.x-x,point.y-y);
    if(distance>radius)continue;
    const key=`${segment.body}:${segment.key}`,previous=nearest.get(key);
    if(previous&&previous.distance<=distance)continue;
    // Perspective-correct position on the world segment, for visibility tests.
    const u=t*a.w/((1-t)*b.w+t*a.w);
    nearest.set(key,{...segment,x,y,distance,u,depth:a.z+(b.z-a.z)*t});
  }
  const candidates=[...nearest.values()],minimum=Math.min(Infinity,...candidates.map(candidate=>candidate.distance));
  return candidates.sort((a,b)=>{
    const priority=candidate=>preferBoundaries&&candidate.boundary&&candidate.distance<=minimum+4?0:1;
    return priority(a)-priority(b)||(Math.abs(a.distance-b.distance)>.5?a.distance-b.distance:a.depth-b.depth)||a.distance-b.distance;
  });
}
