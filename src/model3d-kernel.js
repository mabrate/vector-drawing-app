import * as cad from 'replicad';
import {validModel} from './model3d-data.js';
import {planarChamfer,PLANAR_CHAMFER_TOLERANCE} from './planar-chamfer.js';

// Sample geometry rather than kernel hash codes: hashes change on every rebuild.
// An edge treatment must fail explicitly if a prior edit removes its edge.
export function edgeSignature(edge){
  const points=[0,.25,.5,.75,1].map(t=>{
    const point=edge.pointAt(t);
    try{return point.toTuple().map(n=>Number(n.toFixed(5)));}finally{point.delete();}
  });
  const forward=JSON.stringify(points),reverse=JSON.stringify([...points].reverse());
  return `${edge.geomType}:${Number(edge.length.toFixed(5))}:${forward<reverse?forward:reverse}`;
}

// Paper/SVG circles are four cubic quarter arcs. Recognize that construction,
// including rotated/reversed paths, rather than fitting arbitrary curved art.
// DraftAngle cannot taper their spline extrusion surfaces; circular lofts give
// OpenCascade actual conical walls while the editable recipe stays untouched.
function circularLoop(curves){
  if(curves.length!==4)return null;
  const center=[0,1].map(axis=>curves.reduce((sum,curve)=>sum+curve[0][axis],0)/4);
  const radial=curves.map(curve=>curve[0].map((value,axis)=>value-center[axis]));
  const radius=Math.hypot(...radial[0]),tolerance=Math.max(1e-7,radius*1e-7),kappa=4*(Math.sqrt(2)-1)/3;
  if(radius<=tolerance)return null;
  const sign=Math.sign(radial[0][0]*radial[1][1]-radial[0][1]*radial[1][0]);
  const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<=tolerance;
  for(let i=0;i<4;i++){
    const [start,c1,c2,end]=curves[i],a=radial[i],b=radial[(i+1)%4];
    if(!near(b,[-sign*a[1],sign*a[0]])||!near(end,curves[(i+1)%4][0])||
      !near(c1,[start[0]-sign*kappa*a[1],start[1]+sign*kappa*a[0]])||
      !near(c2,[end[0]+sign*kappa*b[1],end[1]-sign*kappa*b[0]]))return null;
  }
  return {center,radius};
}

function profileSolid(feature){
  const garbage=new Set();const keep=value=>{garbage.add(value);return value;};
  const wire=curves=>{
    const pieces=curves.map(([start,c1,c2,end])=>{
      const p=point=>[...point,0];
      const line=start.every((n,i)=>Math.abs(n-c1[i])<1e-9)&&end.every((n,i)=>Math.abs(n-c2[i])<1e-9);
      return keep(line?cad.makeLine(p(start),p(end)):cad.makeBezierCurve([p(start),p(c1),p(c2),p(end)]));
    });
    return keep(cad.assembleWire(pieces));
  };
  const extrude=(face,angle)=>{
    const solid=keep(cad.basicFaceExtrusion(face,keep(new cad.Vector([0,0,feature.height]))));
    return angle?keep(solid.draft(angle,f=>f.not(f=>f.inPlane('XY',0)).not(f=>f.inPlane('XY',feature.height)))):solid;
  };
  try{
    const solids=feature.profile.map(profile=>{
      const loops=[profile.outer,...profile.holes],circles=feature.draft?loops.map(circularLoop):[];
      let solid;
      if(circles.some(Boolean)){
        const offset=feature.height*Math.tan(feature.draft*Math.PI/180);
        if(circles[0])for(const circle of circles.slice(1))if(circle&&
          Math.hypot(...circle.center.map((value,i)=>value-circles[0].center[i]))+circle.radius+offset>=circles[0].radius-offset)
          throw Error('The draft closes the wall around a circular hole before the top. Reduce the draft angle or height.');
        const drafted=loops.map((curves,index)=>{
          const angle=index?-feature.draft:feature.draft,circle=circles[index];
          if(!circle)return extrude(keep(cad.makeFace(wire(curves))),angle);
          const topRadius=circle.radius-feature.height*Math.tan(angle*Math.PI/180);
          if(topRadius<=1e-7)throw Error(`The draft closes ${index?'a circular hole':'the circular profile'} before the top. Reduce the draft angle or height.`);
          const sections=[circle.radius,topRadius].map((radius,i)=>keep(cad.assembleWire([
            keep(cad.makeCircle(radius,[...circle.center,i*feature.height]))
          ])));
          return keep(cad.loft(sections,{ruled:true}));
        });
        solid=drafted[0];
        for(const hole of drafted.slice(1))solid=keep(solid.cut(hole));
        const checker=new (cad.getOC()).BRepCheck_Analyzer(solid.wrapped);
        try{if(!checker.IsValid())throw Error('The draft does not leave a valid solid. Reduce the draft angle or height.');}finally{checker.delete();}
      }else solid=extrude(keep(cad.makeFace(wire(profile.outer),profile.holes.map(wire))),feature.draft);
      if(feature.start)solid=keep(solid.translateZ(feature.start));
      return solid;
    });
    let result=solids[0];
    for(const solid of solids.slice(1))result=keep(result.fuse(solid));
    garbage.delete(result);return result;
  }finally{
    // Some sketch/transform methods consume their input. Replicad's delete is
    // idempotent, including objects consumed by the underlying operation.
    for(const value of garbage)value.delete();
  }
}

export function buildModel(model,{planarFallback=true}={}){
  if(!validModel(model))throw Error('Invalid 3D model recipe.');
  const bodies=new Map();
  try{
    for(const feature of model.features){
      try{
        if(feature.kind==='extrusion'){
          const tool=profileSolid(feature);
          if(feature.operation==='new')bodies.set(feature.id,{id:feature.id,name:feature.name,shape:tool});
          else{
            const body=bodies.get(feature.target);
            try{
              const next=feature.operation==='join'?body.shape.fuse(tool):body.shape.cut(tool);
              body.shape.delete();body.shape=next;
            }finally{tool.delete();}
          }
        }else{
          const body=bodies.get(feature.target),wanted=new Set(feature.edges),found=new Set();
          for(const edge of body.shape.edges){try{const key=edgeSignature(edge);if(wanted.has(key))found.add(key);}finally{edge.delete();}}
          if(found.size!==wanted.size)throw Error('A selected edge changed. Remove this treatment and select the edge again.');
          let next;
          try{
            next=body.shape[feature.kind](edge=>wanted.has(edgeSignature(edge))?feature.amount:null);
            const checker=new (cad.getOC()).BRepCheck_Analyzer(next.wrapped);
            try{if(!checker.IsValid())throw Error('The edge treatment did not produce a valid solid.');}finally{checker.delete();}
          }catch(error){
            next?.delete();
            if(feature.kind!=='chamfer'||!planarFallback)throw error;
            try{next=planarChamfer(body.shape,wanted,feature.amount,edgeSignature);body.planarBevelTolerance=PLANAR_CHAMFER_TOLERANCE;}
            catch{throw error;}
          }
          body.shape.delete();body.shape=next;
        }
        const body=bodies.get(feature.operation==='new'?feature.id:feature.target);
        const volume=cad.measureVolume(body.shape);
        if(!Number.isFinite(volume)||volume<=1e-7)throw Error('The operation leaves no solid. Adjust the dimensions or target.');
      }catch(error){
        const message=typeof error?.message==='string'&&!/^\d+$/.test(error.message)?error.message:'The geometry could not be built. Try a smaller draft, chamfer, or fillet, and check that the profiles form valid solids.';
        throw Error(`${feature.name}: ${message}`);
      }
    }
    return bodies;
  }catch(error){disposeBodies(bodies);throw error;}
}

export function disposeBodies(bodies){for(const {shape} of bodies.values())shape.delete();bodies.clear();}

export function modelMeshes(bodies){
  return [...bodies.values()].map(body=>{
    const mesh=body.shape.mesh({tolerance:.05,angularTolerance:.15});
    const edgeMesh=body.shape.meshEdges({tolerance:.05,angularTolerance:.15}),topology=new Map(),planes=[],planeKeys=new Map();
    function planeIdFor(normal,offset){
      const key=[...normal.map(value=>Number(value.toFixed(8))),Number(offset.toFixed(5))].join(',');
      if(!planeKeys.has(key)){planeKeys.set(key,planes.length);planes.push({normal,offset});}
      return planeKeys.get(key);
    }
    for(const edge of body.shape.edges){
      try{
        const start=edge.startPoint,end=edge.endPoint;
        try{
          const data={key:edgeSignature(edge),endpoints:[start.toTuple(),end.toTuple()],planeIds:[]};
          // A rim left by a bevel may border only curved/sloped faces. Exact
          // curve bounds still identify level planes without relying on an
          // adjacent flat face or on a few display-mesh sample points.
          const box=edge.boundingBox;
          try{const [min,max]=box.bounds;for(let axis=0;axis<3;axis++)if(max[axis]-min[axis]<1e-6){const normal=[0,0,0];normal[axis]=1;data.planeIds.push(planeIdFor(normal,(min[axis]+max[axis])/2));}}
          finally{box.delete();}
          topology.set(edge.hashCode,data);
        }
        finally{start.delete();end.delete();}
      }finally{edge.delete();}
    }
    const adjacentNormals=new Map();
    for(const face of body.shape.faces){
      try{
        if(face.geomType!=='PLANE')continue;
        const normal=face.normalAt(),center=face.center;
        let planeId;
        try{
          const direction=normal.toTuple(),sign=direction.find(value=>Math.abs(value)>1e-9)<0?-1:1;
          const canonical=direction.map(value=>value*sign),point=center.toTuple(),offset=canonical.reduce((sum,value,i)=>sum+value*point[i],0);
          planeId=planeIdFor(canonical,offset);
        }finally{normal.delete();center.delete();}
        for(const edge of face.edges){try{const data=topology.get(edge.hashCode);if(data&&!data.planeIds.includes(planeId))data.planeIds.push(planeId);if(!adjacentNormals.has(edge.hashCode))adjacentNormals.set(edge.hashCode,[]);adjacentNormals.get(edge.hashCode).push(planes[planeId].normal);}finally{edge.delete();}}
      }finally{face.delete();}
    }
    const visible=group=>{
      if(!body.planarBevelTolerance)return true;
      const normals=adjacentNormals.get(group.edgeId);
      // The generated bevel's internal surface triangles are tessellation,
      // rather than additional editable ridges. Keep cap and wall boundaries.
      if(normals?.length!==2||normals.some(n=>Math.abs(n[2])<.1||Math.abs(n[2])>.95))return true;
      return Math.abs(normals[0].reduce((sum,n,i)=>sum+n*normals[1][i],0))<Math.cos(5*Math.PI/180);
    };
    return {id:body.id,name:body.name,mesh,edges:{...edgeMesh,planes,edgeGroups:edgeMesh.edgeGroups.filter(visible).map(group=>({...group,...topology.get(group.edgeId)}))},volume:cad.measureVolume(body.shape),planarBevelTolerance:body.planarBevelTolerance||0};
  });
}

export function exportModel(bodies,format){
  if(!bodies.size)throw Error('Add an extrusion before exporting.');
  // compoundShapes consumes its inputs; exports must preserve the live model.
  const combined=cad.makeCompound([...bodies.values()].map(body=>body.shape.clone()));
  try{return format==='step'?combined.blobSTEP():combined.blobSTL({binary:true,tolerance:.02,angularTolerance:.1});}
  finally{combined.delete();}
}
