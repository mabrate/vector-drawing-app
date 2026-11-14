import * as cad from 'replicad';
import {topology} from './model3d-topology.js';
import {chamferCatalog,selectionContours,resolveChamfer,inspectChamfer} from './model3d-chamfer-analysis.js';
import {planarChamfer,PLANAR_CHAMFER_TOLERANCE} from './planar-chamfer.js';

export function buildChamfer(shape,feature,signature,{planarFallback=true,progress=()=>{},resolved=()=>{}}={}){
  progress('Recognizing chamfer boundaries…');
  const catalog=chamferCatalog(shape,signature),available=new Set();
  for(const edge of topology(shape,'edge')){try{available.add(signature(edge));}finally{edge.delete();}}
  let report;
  try{
    const {keys,rebound}=resolveChamfer(catalog,feature,available),selection=selectionContours(catalog,keys);
    report={...inspectChamfer(catalog,keys,feature.amount,[],feature.cleanupTolerance||0),featureId:feature.id,rebound,prepared:!!feature.cleanupTolerance};
    if(report.problem)throw Error(report.problem);
    const patch={edges:keys};if(selection.complete)patch.intent={version:1,contours:selection.contours.map(contour=>contour.intent)};
    if(feature.cleanupTolerance&&!report.contourMethod)throw Error('Preparation needs a complete planar rim or junction with nearly vertical walls. Select its entire contour.');
    const wanted=new Set(keys),preferContour=planarFallback&&report.contourMethod&&(report.shortEdges.length>0||feature.cleanupTolerance);
    const attempts=feature.cleanupTolerance?['contour']:planarFallback?(preferContour?['contour','native']:['native','contour']):['native'];
    let lastError;
    for(const method of attempts){
      if(method==='contour'&&!report.contourMethod)continue;
      let result;
      try{
        progress(method==='contour'?'Building contour bevel…':'Building CAD chamfer…');
        if(method==='contour')result=planarChamfer(shape,wanted,feature.amount,signature,{catalog,cleanupTolerance:feature.cleanupTolerance||0});
        else{
          // Isolate the native builder from the live solid and cached source.
          const copy=cad.deserializeShape(shape.serialize());
          try{result=copy.chamfer(edge=>wanted.has(signature(edge))?feature.amount:null);}finally{copy.delete();}
        }
        progress('Checking chamfer solid…');
        const checker=new (cad.getOC()).BRepCheck_Analyzer(result.wrapped);
        try{if(!checker.IsValid())throw Error('The chamfer produced invalid or intersecting surfaces.');}finally{checker.delete();}
        const before=cad.measureVolume(shape),after=cad.measureVolume(result),kinds=new Set(selection.contours.map(contour=>contour.kind));
        if(!Number.isFinite(after)||after<=1e-7||Math.abs(after-before)<=1e-8)throw Error('The requested size did not produce a solid bevel.');
        if(selection.complete){
          const adds=[...kinds].every(kind=>kind.endsWith('junction')),cuts=[...kinds].every(kind=>kind.endsWith('rim'));
          if(adds&&after<before||cuts&&after>before)throw Error('The chamfer changed material on the wrong side of this boundary.');
        }
        const oldBox=shape.boundingBox,newBox=result.boundingBox;
        try{if(newBox.bounds.flat().some((n,i)=>i<3?n<oldBox.bounds.flat()[i]-.04:n>oldBox.bounds.flat()[i]+.04))throw Error('The chamfer extends outside its supporting body.');}finally{oldBox.delete();newBox.delete();}
        resolved(feature.id,patch);
        return {shape:result,report:{...report,method,tolerance:method==='contour'?PLANAR_CHAMFER_TOLERANCE+(feature.cleanupTolerance||0):0}};
      }catch(error){result?.delete();lastError=error;}
    }
    const reason=typeof lastError?.message==='string'&&!/^\d+$/.test(lastError.message)?lastError.message:'The neighboring surfaces could not be joined at this size.';
    throw Error(`${reason} Try a smaller size${report.shortEdges.length?' or preview contour preparation':''}.`);
  }catch(error){error.chamfer={...report,featureId:feature.id};throw error;}
}

// Preview and exports must be closed and consistently wound, including seams
// between separately tessellated CAD faces. Float32 display vertices are welded
// at 0.00001 mm; zero-area triangles are ignored without introducing open seams.
function assertPrintableTriangles(triangles){
  const edges=new Map();let usable=0;
  for(const triangle of triangles){
    if(triangle.some(point=>point.some(n=>!Number.isFinite(n))))throw Error('The chamfer mesh contains invalid coordinates.');
    const points=triangle.map(point=>point.map(n=>Math.round(n*1e5)).join(','));
    if(new Set(points).size!==3)continue;usable++;
    for(let j=0;j<3;j++){
      const a=points[j],b=points[(j+1)%3],key=a<b?`${a}|${b}`:`${b}|${a}`,entry=edges.get(key)||{count:0,winding:0};
      entry.count++;entry.winding+=a<b?1:-1;edges.set(key,entry);
    }
  }
  if(!usable||[...edges.values()].some(edge=>edge.count!==2||edge.winding!==0))throw Error('The chamfer mesh is not watertight. Reduce the size or try contour preparation; this preview cannot be applied.');
}

export function assertPrintableMesh({vertices,triangles}){
  function* points(){for(let i=0;i<triangles.length;i+=3)yield Array.from(triangles.slice(i,i+3),index=>[0,1,2].map(axis=>vertices[index*3+axis]));}
  assertPrintableTriangles(points());
}

export function assertPrintableSTL(buffer){
  const view=new DataView(buffer);if(view.byteLength<84||view.byteLength!==84+view.getUint32(80,true)*50)throw Error('The printable STL could not be verified.');
  function* points(){for(let i=0;i<view.getUint32(80,true);i++)yield [0,1,2].map(vertex=>[0,1,2].map(axis=>view.getFloat32(84+i*50+12+vertex*12+axis*4,true)));}
  assertPrintableTriangles(points());
}
