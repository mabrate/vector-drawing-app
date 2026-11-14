const FLATNESS=.002;
const length2=(a,b)=>a.reduce((sum,n,i)=>sum+(n-b[i])**2,0);
export function pointDistance2(p,a,b){
  const dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;
  return (p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2;
}
export function sampleWire(wire){
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
