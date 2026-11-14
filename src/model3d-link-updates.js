import {bindSources,linkLegacyModel,reconcileSources,refreshLinkedModel} from './model3d-links.js';

// Geometry and its linked recipe enter the same existing Undo snapshot. CAD
// validation is asynchronous and never writes artwork/history from its callback.
export function installLinkedModelUpdates({paper,getPaths,getModel,setModel,undoTo,undoDepth,openModel}){
  const panel=document.createElement('div');panel.id='model3d-link-status';panel.hidden=true;panel.dataset.state='ready';panel.setAttribute('aria-live','polite');
  panel.innerHTML='<span id="model3d-link-message"></span><div><button id="model3d-link-undo">Undo path edit</button><button id="model3d-link-keep">Keep edit</button><button id="model3d-link-repair">Repair in 3D</button></div>';
  document.body.append(panel);
  const message=panel.querySelector('span'),undo=panel.querySelector('#model3d-link-undo'),keep=panel.querySelector('#model3d-link-keep'),repair=panel.querySelector('#model3d-link-repair');
  let owners=new Map(),worker=null,inFlight=null,queued=null,timer=null,watchdog=null,generation=0,lastKey='',rollback=null,dismissed=false;
  const key=()=>JSON.stringify(getModel()||null);
  const linked=()=>getModel()?.features?.some(feature=>feature.sourceIds);
  function cancel(){++generation;clearTimeout(timer);clearTimeout(watchdog);timer=null;watchdog=null;queued=null;if(inFlight){worker?.terminate();worker=null;inFlight=null;}}
  function show(state,text=''){
    panel.dataset.state=state;panel.hidden=state==='ready';panel.classList.toggle('model3d-link-error',state==='broken');message.textContent=text;
    panel.querySelector('div').hidden=state!=='broken';panel.setAttribute('role',state==='broken'?'alert':'status');
    const depth=rollback?undoDepth(rollback):0;undo.disabled=!depth;undo.textContent=depth>1?'Undo path edit and later changes':'Undo path edit';
    undo.title=depth>1?'Returns to before the path edit. Later edits stay available through Redo.':'';
  }
  function broken(error){show('broken',`${rollback?'This path change breaks the linked 3D model.':'The linked 3D model needs attention.'} ${error} Undo the edit, or keep it and repair the affected feature.`);}
  function pump(){
    if(inFlight||!queued)return;
    if(!worker){
      try{
        const instance=new Worker(new URL('./model3d.worker.js',import.meta.url),{type:'module'});worker=instance;
        worker.onmessage=event=>{
          if(worker!==instance)return;
          const result=event.data;if(result.id!==inFlight?.id)return;
          if(result.type==='progress')return;
          clearTimeout(watchdog);watchdog=null;
          const request=inFlight;inFlight=null;
          if(request.id===generation&&request.key===key()){
            if(result.error)broken(result.error);
            else{rollback=null;show('ready');}
          }
          pump();
        };
        worker.onerror=()=>{
          if(worker!==instance)return;clearTimeout(watchdog);watchdog=null;
          const current=inFlight;inFlight=null;worker?.terminate();worker=null;
          if(current?.id===generation)show('broken','The linked 3D model could not be checked. Undo the path edit, or keep it and check the model in 3D.');pump();
        };
      }catch{show('broken','The linked 3D engine could not load. Undo the path edit, or keep it and check the model in 3D.');queued=null;return;}
    }
    inFlight=queued;queued=null;watchdog=setTimeout(()=>{
      const request=inFlight;worker?.terminate();worker=null;inFlight=null;
      if(request?.id===generation)broken('The model check exceeded two minutes and was stopped.');pump();
    },120000);worker.postMessage(inFlight);
  }
  function check(before){
    cancel();dismissed=false;if(!linked()){rollback=null;show('ready');return;}
    if(!rollback)rollback=before||null;
    lastKey=key();const id=generation,model=structuredClone(getModel());
    const invalid=model.features.find(feature=>feature.sourceError);
    if(invalid){broken(`${invalid.name}: ${invalid.sourceError}`);return;}
    show('checking','Updating linked 3D model…');
    timer=setTimeout(()=>{timer=null;if(id!==generation)return;queued={id,type:'validate',model,key:lastKey};pump();},150);
  }
  function reset({migrate=false}={}){
    cancel();rollback=null;dismissed=false;owners=new Map();
    if(migrate){const migrated=linkLegacyModel(paper,[...getPaths()],getModel());if(migrated.bindings.length){bindSources(paper,[...getPaths()],migrated.bindings);setModel(migrated.model);}}
    reconcileSources(paper,[...getPaths()],owners);lastKey=key();show('ready');
  }
  function prepare(){
    if(!linked())return false;
    const next=refreshLinkedModel(paper,[...getPaths()],getModel(),owners);if(next.changed)setModel(next.model);return next.changed;
  }
  function committed({before,changed}){
    if(changed)check(before);
    else if(key()!==lastKey){cancel();rollback=null;lastKey=key();show('ready');}
    else if(panel.dataset.state==='broken'&&!dismissed)show('broken',message.textContent);
  }
  function accept(model,bindings){
    cancel();rollback=null;dismissed=false;bindSources(paper,[...getPaths()],bindings);setModel(model);reconcileSources(paper,[...getPaths()],owners);lastKey=key();show('ready');
  }
  undo.onclick=()=>{if(rollback&&undoDepth(rollback))undoTo(rollback);};
  keep.onclick=()=>{rollback=null;dismissed=true;panel.hidden=true;};repair.onclick=openModel;
  window.addEventListener('pagehide',()=>{cancel();worker?.terminate();worker=null;inFlight=null;});
  reset();return {prepare,committed,accept,reset,checkCurrent:check};
}
