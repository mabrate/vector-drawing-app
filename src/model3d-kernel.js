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
  try{
    const solids=feature.profile.map(profile=>{
      const face=keep(cad.makeFace(wire(profile.outer),profile.holes.map(wire)));
      let solid=keep(cad.basicFaceExtrusion(face,keep(new cad.Vector([0,0,feature.height]))));
      if(feature.draft)solid=keep(solid.draft(feature.draft,f=>f.not(f=>f.inPlane('XY',0)).not(f=>f.inPlane('XY',feature.height))));
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
