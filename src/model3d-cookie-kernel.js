import * as cad from 'replicad';
import ClipperLib from 'clipper-lib';
import {cookieError} from './model3d-cookie.js';
import {sampleWire,pointDistance2} from './model3d-contours.js';
import {circularLoop} from './model3d-circle.js';

export function cookieSolid(feature){
  const error=cookieError(feature);if(error)throw Error(error);
  const garbage=new Set(),keep=value=>{garbage.add(value);return value;};
  const wire=curves=>{
    const circle=circularLoop(curves);
    if(circle)return keep(cad.assembleWire([keep(cad.makeCircle(circle.radius,[...circle.center,0]))]));
    return keep(cad.assembleWire(curves.map(([a,b,c,d])=>{
      const p=value=>[...value,0],line=a.every((v,i)=>Math.abs(v-b[i])<1e-9)&&d.every((v,i)=>Math.abs(v-c[i])<1e-9);
      return keep(line?cad.makeLine(p(a),p(d)):cad.makeBezierCurve([p(a),p(b),p(c),p(d)]));
    })));
  };
  const face=outer=>keep(cad.makeFace(outer));
  const area=outer=>cad.measureArea(face(outer));
  function boundedOffset(outer){
    // OC offset curves can retain unbounded basis curves that render correctly
    // but cannot be written to STEP. Fit only those generated offsets to finite
    // splines; the original cutting edge and emboss top curves stay untouched.
    const edges=outer.edges;
    try{
      if(edges.every(edge=>['LINE','CIRCLE','ELLIPSE'].includes(edge.geomType)))return outer;
      const finite=edges.map(edge=>{
        if(['LINE','CIRCLE','ELLIPSE'].includes(edge.geomType))return keep(edge.clone());
        const at=t=>{const value=edge.pointAt(t);try{return value.toTuple();}finally{value.delete();}},points=[at(0)];
        function sample(t0,a,t1,b,depth=0){
          const t=(t0+t1)/2,m=at(t);
          if(depth<12&&(t1-t0>.125||pointDistance2(m,a,b)>1e-8)){sample(t0,a,t,m,depth+1);sample(t,m,t1,b,depth+1);}else points.push(b);
          if(points.length>2000)throw Error('The offset is too complex. Simplify the drawing paths.');
        }
        sample(0,points[0],1,at(1));
        return keep(cad.makeBSplineApproximation(points,{tolerance:.00001,degMax:8,degMin:3}));
      });
      return keep(cad.assembleWire(finite));
    }finally{edges.forEach(edge=>edge.delete());}
  }
  function offset(outer,distance){
    if(!distance)return keep(outer.clone());
    const before=area(outer);let last;
    for(const kind of ['intersection','arc'])for(const sign of [1,-1])try{
      const result=keep(keep(outer.clone()).offset2D(sign*distance,kind)),after=area(result);
      if(distance>0?after>before+1e-8:after<before-1e-8&&after>1e-8)return boundedOffset(result);
    }catch(reason){last=reason;}
    throw Error('A wall, base offset, or emboss draft collapses a contour. Reduce its size or simplify the path.'+(last?.message?` ${last.message}`:''));
  }
  const extrude=(shape,height,start=0)=>{
    const solid=keep(cad.basicFaceExtrusion(shape,keep(new cad.Vector([0,0,height]))));
    return start?keep(solid.translateZ(start)):solid;
  };
  const ring=(outer,inner,height,start=0)=>extrude(keep(cad.addHolesInFace(face(outer),[inner])),height,start);
  const fuse=(a,b)=>keep(a.fuse(b));
  const topOfBase=feature.baseThickness,cut=feature.cut.profile[0];
  try{
    const outer=wire(cut.outer),holes=cut.holes.map(wire);
    const baseOuter=offset(outer,feature.baseOffset),wallOuter=offset(outer,feature.wallThickness);
    let result=feature.baseMode==='solid'?extrude(face(baseOuter),topOfBase):ring(baseOuter,outer,topOfBase);
    result=fuse(result,ring(wallOuter,outer,feature.cutHeight,topOfBase));
    for(const hole of holes){
      const inner=offset(hole,-feature.wallThickness);
      result=fuse(result,ring(hole,inner,feature.cutHeight,topOfBase));
      if(feature.baseMode==='solid')continue;
      result=fuse(result,extrude(face(hole),topOfBase));
    }
    const outline=sampleWire(outer),polygon=points=>points.map(([X,Y])=>({X:Math.round(X*1e6),Y:Math.round(Y*1e6)}));
    const cutPolygons=[polygon(outline),...holes.map(hole=>polygon(sampleWire(hole)))];
    function insideCookie(points,topHoles){
      const clipper=new ClipperLib.Clipper(),outside=[];
      clipper.AddPaths([polygon(points),...topHoles.map(hole=>polygon(sampleWire(hole)))],ClipperLib.PolyType.ptSubject,true);
      clipper.AddPaths(cutPolygons,ClipperLib.PolyType.ptClip,true);
      clipper.Execute(ClipperLib.ClipType.ctDifference,outside,ClipperLib.PolyFillType.pftEvenOdd,ClipperLib.PolyFillType.pftEvenOdd);
      return outside.reduce((sum,path)=>sum+Math.abs(ClipperLib.Clipper.Area(path))/1e12,0)<.001;
    }
    function bridge(start){
      let end=null,best=Infinity;
      for(let i=0;i<outline.length;i++){
        const a=outline[i],b=outline[(i+1)%outline.length],dx=b[0]-a[0],dy=b[1]-a[1],length=dx*dx+dy*dy;
        const t=length?Math.max(0,Math.min(1,((start[0]-a[0])*dx+(start[1]-a[1])*dy)/length)):0,p=[a[0]+t*dx,a[1]+t*dy],distance=Math.hypot(p[0]-start[0],p[1]-start[1]);
        if(distance<best){best=distance;end=p;}
      }
      if(best<1e-7)return;
      const ux=(end[0]-start[0])/best,uy=(end[1]-start[1])/best,half=feature.bridgeWidth/2;
      const a=[start[0]-ux*half,start[1]-uy*half],b=[end[0]+ux*feature.baseOffset/2,end[1]+uy*feature.baseOffset/2];
      const points=[[a[0]-uy*half,a[1]+ux*half,0],[a[0]+uy*half,a[1]-ux*half,0],[b[0]+uy*half,b[1]-ux*half,0],[b[0]-uy*half,b[1]+ux*half,0]];
      result=fuse(result,extrude(keep(cad.makePolygon(points)),topOfBase));
    }
    if(feature.baseMode==='open')holes.forEach(hole=>bridge(sampleWire(hole)[0]));
    const embossHeight=feature.cutHeight-feature.embossSetback,spread=embossHeight*Math.tan(feature.draftAngle*Math.PI/180);
    function draftedLoop(top,hole=false){
      if(!spread)return extrude(face(top),embossHeight,topOfBase);
      const bottom=offset(top,hole?-spread:spread),lower=keep(bottom.translateZ(topOfBase)),upper=keep(top.clone().translateZ(topOfBase+embossHeight));
      try{return keep(cad.loft([lower,upper],{ruled:true}));}
      catch{throw Error('The emboss draft could not follow this contour. Reduce the angle or simplify the emboss path.');}
    }
    for(const shape of feature.emboss)for(const profile of shape.profile){
      const top=wire(profile.outer),points=sampleWire(top),topHoles=profile.holes.map(wire);
      if(!insideCookie(points,topHoles))throw Error('Every emboss top must lie inside the cut outline, away from internal cut holes. Move or resize the emboss paths in the drawing.');
      let stamp=draftedLoop(top);
      for(const hole of topHoles)stamp=keep(stamp.cut(draftedLoop(hole,true)));
      result=fuse(result,stamp);
      if(feature.baseMode==='open')bridge(points[0]);
    }
    const checker=new(cad.getOC()).BRepCheck_Analyzer(result.wrapped);
    try{if(!checker.IsValid()||cad.measureVolume(result)<=1e-7)throw Error('The cutter is not a valid solid. Reduce the offsets or draft angle.');}finally{checker.delete();}
    // Supports must produce one connected, printable cutter.
    const solids=result.solids;
    try{if(solids.length!==1)throw Error('The cutter contains disconnected parts. Increase the support bridge width or choose a solid base.');}finally{solids.forEach(solid=>solid.delete());}
    garbage.delete(result);return result;
  }finally{for(const value of garbage)value.delete();}
}
