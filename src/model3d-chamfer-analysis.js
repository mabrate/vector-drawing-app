import {topology} from './model3d-topology.js';
import {sampleWire,pointDistance2} from './model3d-contours.js';

const rounded=n=>Number(n.toFixed(6));

// Boundary intent is expressed relative to the target body. A translation or
// uniform face resize may replace all CAD edges without replacing this rim.
export function chamferCatalog(shape,signature){
  const faces=topology(shape,'face'),records=[],adjacent=new Map(),keyCache=new Map(),box=shape.boundingBox;
  let bounds;
  try{bounds=box.bounds;}finally{box.delete();}
  const key=edge=>{const hash=edge.hashCode;if(!keyCache.has(hash))keyCache.set(hash,signature(edge));return keyCache.get(hash);};
  try{
    for(const face of faces){
      const normal=face.normalAt(),center=face.center,bbox=face.boundingBox;
      let record;
      try{record={face,normal:normal.toTuple().map(n=>n/normal.Length),center:center.toTuple(),bounds:bbox.bounds,planar:face.geomType==='PLANE'};}finally{normal.delete();center.delete();bbox.delete();}
      records.push(record);
      for(const edge of topology(face,'edge')){
        try{const hash=edge.hashCode;if(!adjacent.has(hash))adjacent.set(hash,[]);adjacent.get(hash).push(record);}finally{edge.delete();}
      }
    }
    const result=[];
    for(const record of records){
      if(!record.planar||Math.abs(record.normal[2])<1-1e-8)continue;
      const side=Math.sign(record.normal[2]),z=record.center[2],outer=record.face.clone().outerWire(),holes=record.face.clone().innerWires(),wires=[outer,...holes];
      const boundaries=[];
      try{for(const [index,wire] of wires.entries()){
        const edges=topology(wire,'edge'),keys=[],short=[],levels=new Set();let height=Infinity,tilt=0,segmented=true;
        try{for(const edge of edges){
          const edgeKey=key(edge);keys.push(edgeKey);short.push({key:edgeKey,length:edge.length});segmented&&=edge.geomType==='LINE';
          for(const other of adjacent.get(edge.hashCode)||[]){
            if(other===record)continue;
            const delta=other.center[2]-z;if(Math.abs(delta)<1e-7)continue;
            const direction=Math.sign(delta);levels.add(direction);
            height=Math.min(height,direction>0?other.bounds[1][2]-z:z-other.bounds[0][2]);tilt=Math.max(tilt,Math.abs(other.normal[2]));
          }
        }}finally{edges.forEach(edge=>edge.delete());}
        if(levels.size!==1||!Number.isFinite(height))continue;
        const convex=[...levels][0]===-side,kind=convex?(index?'hole-rim':'outside-rim'):(index?'raised-junction':'cavity-junction');
        const bbox=wire.boundingBox;let relative,span;
        try{const b=bbox.bounds;span=Math.min(b[1][0]-b[0][0],b[1][1]-b[0][1]);relative=b.flat().map((n,i)=>rounded((n-bounds[0][i%3])/Math.max(bounds[1][i%3]-bounds[0][i%3],1e-6)));}finally{bbox.delete();}
        const contour={kind,side,z:rounded(z),height:rounded(height),span,tilt,segmented,keys,edges:short,neighbors:[],intent:{kind,side,bounds:relative}};
        result.push(contour);boundaries.push({contour,wire});
      }
      // Protect other holes and the supporting base edge before a bevel can
      // consume the intervening wall. Sampled-curve clearance is conservative
      // by twice the sampling error; line segments are compared directly.
      if(boundaries.length>1){
        for(const boundary of boundaries)boundary.points=sampleWire(boundary.wire);
        for(let i=0;i<boundaries.length;i++)for(let j=i+1;j<boundaries.length;j++){
          const a=boundaries[i],b=boundaries[j];let distance2=Infinity;
          for(const [first,second] of [[a.points,b.points],[b.points,a.points]])for(const point of first)for(let k=0;k<second.length;k++)distance2=Math.min(distance2,pointDistance2(point,second[k],second[(k+1)%second.length]));
          const clearance=Math.max(0,Math.sqrt(distance2)-.004);
          a.contour.neighbors.push({keys:b.contour.keys,clearance});b.contour.neighbors.push({keys:a.contour.keys,clearance});
        }
      }}finally{wires.forEach(wire=>wire.delete());}
    }
    // The same contour can border two flat faces in unusual solids. Never
    // resolve an intent using duplicate descriptions of the same boundary.
    const seen=new Set();return result.filter(contour=>{const key=[...contour.keys].sort().join('\n');if(seen.has(key))return false;seen.add(key);return true;});
  }finally{faces.forEach(face=>face.delete());}
}

export {CHAMFER_KINDS,chamferLabel,selectionContours,resolveChamfer,inspectChamfer,smallerChamferSizes} from './model3d-chamfer-intent.js';
