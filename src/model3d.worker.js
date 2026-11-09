import initOpenCascade from 'replicad-opencascadejs';
import wasmURL from 'replicad-opencascadejs/wasm?url';
import {setOC} from 'replicad';
import {buildModel,modelMeshes,disposeBodies,exportModel} from './model3d-kernel.js';

const ready=initOpenCascade({locateFile:()=>wasmURL,print:()=>{},printErr:()=>{}}).then(setOC);
let bodies=new Map();
// Initialization and requests are serialized even if several messages arrive
// before the WebAssembly module is ready.
let queue=Promise.resolve();
self.onmessage=event=>{
  queue=queue.then(async()=>{
    const {id,type,model,format}=event.data;
    try{
      await ready;
      if(type==='build'){
        disposeBodies(bodies);bodies=buildModel(model);
        self.postMessage({id,meshes:modelMeshes(bodies)});
      }else if(type==='export')self.postMessage({id,blob:exportModel(bodies,format)});
    }catch(error){self.postMessage({id,error:error.message||'The 3D model could not be built.'});}
  });
};
