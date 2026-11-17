import initOpenCascade from 'replicad-opencascadejs';
import wasmURL from 'replicad-opencascadejs/wasm?url';
import {setOC} from 'replicad';
import {buildModel,modelMeshes,disposeBodies,exportModel,createModelBuildCache} from './model3d-kernel.js';
import {assertPrintableMesh,assertPrintableSTL} from './model3d-chamfer.js';
import {smallerChamferSizes} from './model3d-chamfer-intent.js';

const ready=initOpenCascade({locateFile:()=>wasmURL,print:()=>{},printErr:()=>{}}).then(setOC);
const cache=createModelBuildCache();
let bodies=new Map(),currentKey='',prepared=null;
function discardPrepared(){if(prepared)disposeBodies(prepared.bodies);prepared=null;}
function calculate(source,progress){
  const model=structuredClone(source);let next;
  try{
    next=buildModel(model,{cache,progress,onFeatureResolved(id,patch){Object.assign(model.features.find(feature=>feature.id===id),patch);}});
    progress('Preparing preview surfaces…');const meshes=modelMeshes(next);
    if(model.features.some(feature=>feature.kind==='chamfer')){
      progress('Checking watertight printable surfaces…');for(const body of meshes)assertPrintableMesh(body.mesh);
    }
    return {model,meshes,bodies:next};
  }catch(error){if(next)disposeBodies(next);throw error;}
}
// Requests are serialized. Cancellation terminates this worker, so synchronous
// WebAssembly calls cannot hold the UI or a later request indefinitely.
let queue=Promise.resolve();
self.onmessage=event=>{
  queue=queue.then(async()=>{
    const {id,type,model,format,featureId}=event.data,progress=stage=>self.postMessage({id,type:'progress',stage});
    try{
      progress('Loading the local 3D engine…');await ready;
      if(type==='build'){
        const key=JSON.stringify(model);let next;
        if(prepared&&JSON.stringify(prepared.model)===key){next=prepared;prepared=null;}
        else{discardPrepared();next=calculate(model,progress);}
        disposeBodies(bodies);bodies=next.bodies;currentKey=JSON.stringify(next.model);
        self.postMessage({id,meshes:next.meshes,model:next.model});
      }else if(type==='validate'){
        const check=buildModel(model,{cache,progress});try{self.postMessage({id,valid:true});}finally{disposeBodies(check);}
      }else if(type==='suggest'){
        discardPrepared();const feature=model.features.find(feature=>feature.id===featureId);
        if(!feature||feature.kind!=='chamfer')throw Error('Choose a chamfer to check smaller sizes.');
        for(const amount of smallerChamferSizes(feature.amount)){
          progress(`Checking a smaller chamfer (${amount} mm)…`);
          const candidate=structuredClone(model);candidate.features.find(entry=>entry.id===featureId).amount=amount;
          try{prepared=calculate(candidate,progress);break;}catch{/* Only a complete validated model is offered. */}
        }
        self.postMessage({id,suggestion:prepared?{amount:prepared.model.features.find(feature=>feature.id===featureId).amount,model:prepared.model}:null});
      }else if(type==='export'){
        if(model&&currentKey!==JSON.stringify(model)){
          const next=calculate(model,progress);disposeBodies(bodies);bodies=next.bodies;currentKey=JSON.stringify(next.model);
        }
        progress(`Preparing ${format.toUpperCase()}…`);const blob=await exportModel(bodies,format);
        if(format==='stl'&&[...bodies.values()].some(body=>body.chamfers?.length)){
          progress('Checking the exported STL is watertight…');assertPrintableSTL(await blob.arrayBuffer());
        }
        self.postMessage({id,blob});
      }
    }catch(error){self.postMessage({id,error:error.message||'The 3D model could not be built.',chamfer:error.chamfer});}
  });
};
