import {emptyModel,readModel,selectionProfiles,withoutFeature,MM_PER_PIXEL,MAX_TREATMENT_EDGES,validModel} from './model3d-data.js';
import './model3d.css';

export function installModel3D({paper,getSelection,getModel,setModel,getUnit,finish,say}){
  const dialog=document.createElement('dialog');dialog.id='model3d-dialog';dialog.setAttribute('aria-labelledby','model3d-title');
  dialog.innerHTML=`<div class="model3d-heading"><div><small>EXPERIMENTAL · PLANAR MODELING</small><h2 id="model3d-title">3D model</h2></div><button id="model3d-close" aria-label="Cancel 3D modeling">×</button></div>
    <div class="model3d-layout"><section class="model3d-preview-column" aria-label="Model preview">
      <div class="model3d-views" role="group" aria-label="3D views"><button data-model-view="iso">Isometric</button><button data-model-view="top">Top</button><button data-model-view="front">Front</button><button data-model-view="right">Right</button><button id="model3d-fit">Fit</button></div>
      <div id="model3d-viewer"></div><p class="model3d-gesture-help">Drag to orbit · Right-drag or two fingers to pan/zoom · Tap an edge to select its chain</p>
      <p id="model3d-summary">No solids yet.</p>
    </section><section class="model3d-controls" aria-label="Model features">
      <label class="model3d-unit">Units <select id="model3d-unit"><option value="mm">mm</option><option value="in">in</option><option value="px">px</option><option value="pt">pt</option></select></label>
      <div class="model3d-section-title"><h3>Features</h3><button id="model3d-add">Add selected paths</button></div>
      <p id="model3d-source"></p><ol id="model3d-features" aria-label="Feature history"></ol>
      <fieldset id="model3d-extrusion" hidden><legend>Extrusion</legend>
        <label>Name <input id="model3d-name" maxlength="100"></label>
        <label>Operation <select id="model3d-operation"><option value="new">New solid</option><option value="join">Add to solid</option><option value="cut">Cut from solid</option></select></label>
        <label id="model3d-target-label">Target <select id="model3d-target"></select></label>
        <div class="model3d-pair"><label>Height <input id="model3d-height" type="number" step="any" min="0.0001"></label><label>Start height <input id="model3d-start" type="number" step="any"></label></div>
        <label>Draft angle (°) <input id="model3d-draft" type="number" step="any" min="-60" max="60"></label>
        <small>Positive draft tapers inward; negative expands outward. The profile stays fixed at the starting height.</small>
        <button id="model3d-replace">Replace profile with selected paths</button>
      </fieldset>
      <fieldset id="model3d-treatment" hidden><legend>Edge treatment</legend><label>Size <input id="model3d-treatment-size" type="number" step="any" min="0.0001"></label><small id="model3d-treatment-help"></small></fieldset>
      <fieldset id="model3d-edges"><legend>Chamfer / fillet</legend><p id="model3d-edge-count">Select an edge in the preview.</p>
        <label>Selection <select id="model3d-edge-mode"><option value="connected">Connected in plane</option><option value="individual">Individual edges</option></select></label>
        <label><span id="model3d-edge-picker-label">Choose a chain</span><select id="model3d-edge-picker"><option value="">Pick a chain…</option></select></label>
        <button id="model3d-clear-edges" disabled>Clear selection</button>
        <label>Size <input id="model3d-edge-size" type="number" step="any" value="1" min="0.0001"></label>
        <div class="model3d-pair"><button id="model3d-chamfer" disabled>Add chamfer</button><button id="model3d-fillet" disabled>Add fillet</button></div>
        <small>One tap selects connected edges in the same plane, including curved pieces. Separate holes and other heights stay separate. Use Individual edges for one piece. Join extrusions before treating their shared junction.</small>
      </fieldset>
      <p class="model3d-storage-help">Profiles are copied from the selected paths. Edit heights here, or select revised paths and replace a feature’s profile. Save an editable SVG to keep the model.</p>
    </section></div>
    <p id="model3d-status" role="status" aria-live="polite"></p>
    <div class="model3d-footer"><div class="model3d-exports"><button id="model3d-stl" disabled>Download STL</button><button id="model3d-step" disabled>Download STEP</button></div><div><button id="model3d-cancel">Cancel</button><button id="model3d-apply" class="primary" disabled>Apply model</button></div></div>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector(`#model3d-${id}`);
  const entry=document.createElement('button');entry.id='model3d-open';entry.textContent='3D model…';document.querySelector('header nav').insertBefore(entry,document.getElementById('save'));
  const extrude=document.createElement('button');extrude.id='extrude-path';extrude.textContent='Extrude…';document.querySelector('.object-actions').append(extrude);
  let working=emptyModel(),source=null,sourceError='',activeId=null,viewer=null,worker=null,sequence=0,inFlight=null,queued=null,valid=false,meshes=[],edges=[],edgeOptions=[],timer=null,session=0,unit='mm',exporting=false,needsFit=true,loading=false;
  const unitFactors={mm:1,in:25.4,px:MM_PER_PIXEL,pt:25.4/72};
  const active=()=>working.features.find(feature=>feature.id===activeId);
  const format=value=>String(Number((value/unitFactors[unit]).toFixed(6)));
  function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('model3d-error',error);}
  function enable(){
    const ready=valid&&!inFlight&&!queued&&!timer&&!loading&&!exporting;
    $('add').disabled=$('replace').disabled=!source||loading||exporting;
    $('extrusion').disabled=$('treatment').disabled=loading||exporting;
    $('apply').disabled=!ready;$('stl').disabled=$('step').disabled=!ready||!meshes.length;
    $('chamfer').disabled=$('fillet').disabled=!ready||!edges.length;
    $('clear-edges').disabled=!edges.length;
  }
  function onSelection(next){edges=next;const target=$('edge-mode').value==='individual'?'edge':'chain';$('edge-count').textContent=edges.length?`${edges.length} edge${edges.length===1?'':'s'} selected. Tap the ${target} again to deselect.`:'Select an edge in the preview.';enable();}
  function updateList(){
    $('features').replaceChildren();
    for(const feature of working.features){
      const row=document.createElement('li'),button=document.createElement('button'),remove=document.createElement('button');
      button.textContent=feature.name;button.setAttribute('aria-pressed',String(feature.id===activeId));button.onclick=()=>{activeId=feature.id;updateList();showFeature();};
      const detail=document.createElement('small');detail.textContent=feature.kind==='extrusion'?`${{new:'New solid',join:'Add',cut:'Cut'}[feature.operation]} · ${format(feature.height)} ${unit}${feature.draft?` · ${feature.draft}°`:''}`:`${feature.kind} · ${format(feature.amount)} ${unit}`;button.append(detail);
      remove.textContent='×';remove.setAttribute('aria-label',`Remove ${feature.name}`);remove.onclick=()=>{working=withoutFeature(working,feature.id);if(!working.features.some(feature=>feature.id===activeId))activeId=working.features.at(-1)?.id||null;updateList();showFeature();schedule();};
      row.append(button,remove);$('features').append(row);
    }
  }
  function targetOptions(feature){
    $('target').replaceChildren();
    const position=working.features.indexOf(feature);
    for(const body of working.features.slice(0,position).filter(item=>item.kind==='extrusion'&&item.operation==='new')){
      const option=document.createElement('option');option.value=body.id;option.textContent=body.name;$('target').append(option);
    }
    if(feature.target)$('target').value=feature.target;
    $('target-label').hidden=feature.operation==='new';
    for(const option of $('operation').options)option.disabled=option.value!=='new'&&!$('target').options.length;
  }
  function showFeature(){
    const feature=active();$('extrusion').hidden=feature?.kind!=='extrusion';$('treatment').hidden=!feature||feature.kind==='extrusion';
    if(!feature)return;
    if(feature.kind==='extrusion'){
      $('name').value=feature.name;$('operation').value=feature.operation;targetOptions(feature);
      for(const key of ['height','start'])$(key).value=format(feature[key]);$('draft').value=feature.draft;
    }else{$('treatment-size').value=format(feature.amount);$('treatment-help').textContent=`${feature.edges.length} edge${feature.edges.length===1?'':'s'} · ${feature.kind}. Remove this feature to select different edges.`;}
  }
  function controlsChanged(){
    const feature=active();if(!feature)return;
    if(feature.kind==='extrusion'){
      feature.name=$('name').value.trim()||'Extrusion';feature.operation=$('operation').value;
      feature.target=feature.operation==='new'?null:$('target').value||null;
      feature.height=$('height').valueAsNumber*unitFactors[unit];feature.start=$('start').valueAsNumber*unitFactors[unit];feature.draft=$('draft').valueAsNumber;
      targetOptions(feature);
    }else feature.amount=$('treatment-size').valueAsNumber*unitFactors[unit];
    updateList();schedule();
  }
  function cancelPending(){clearTimeout(timer);timer=null;queued=null;}
  function schedule(){
    clearTimeout(timer);valid=false;enable();status('Updating preview…');
    timer=setTimeout(()=>{timer=null;requestBuild();},300);
  }
  function requestBuild(){
    if(!dialog.open||!worker)return;
    if(!validModel(working)){queued=null;valid=false;status('Check the dimensions and target. Height must be positive, draft must be between −60° and 60°, and each operation needs an earlier solid.',true);enable();return;}
    queued={id:++sequence,type:'build',model:structuredClone(working)};valid=false;enable();pump();
  }
  function pump(){if(inFlight||!queued||!worker)return;inFlight=queued;queued=null;worker.postMessage(inFlight);}
  function populateEdges(){
    const individual=$('edge-mode').value==='individual';
    $('edge-picker-label').textContent=individual?'Choose an edge':'Choose a chain';
    edgeOptions=[];$('edge-picker').replaceChildren(new Option(individual?'Pick an edge…':'Pick a chain…',''));
    for(const body of viewer?.edgeChoices()||[]){
      const group=document.createElement('optgroup');group.label=body.name;
      body.choices.forEach((edge,index)=>{edgeOptions.push({body:body.id,key:edge.key,chainId:edge.chainId});group.append(new Option(individual?`Edge ${index+1}`:`Chain ${index+1} (${edge.keys.length} edge${edge.keys.length===1?'':'s'})`,String(edgeOptions.length-1)));});$('edge-picker').append(group);
    }
  }
  function receive(event){
    const result=event.data;if(!inFlight||result.id!==inFlight.id)return;
    const request=inFlight;inFlight=null;
    if(request.type==='export'){
      exporting=false;
      if(result.error)status(result.error,true);
      else{const url=URL.createObjectURL(result.blob),link=document.createElement('a');link.href=url;link.download=`vector-lab-model.${request.format==='step'?'step':'stl'}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status(`Downloaded ${request.format.toUpperCase()} in millimeters. Apply the model and save an editable SVG to keep its features.`);}
      enable();return;
    }
    // Ignore results superseded by another edit, including an invalid input.
    if(queued||timer||JSON.stringify(request.model)!==JSON.stringify(working)){pump();enable();return;}
    if(result.error){valid=false;status(result.error,true);$('summary').textContent='Preview could not update. The last successful view is shown.';}
    else{
      meshes=result.meshes;valid=true;viewer?.setMeshes(meshes,needsFit);needsFit=false;populateEdges();
      const volume=meshes.reduce((sum,mesh)=>sum+mesh.volume,0),value=volume/unitFactors[unit]**3;
      $('summary').textContent=meshes.length?`${meshes.length} solid group${meshes.length===1?'':'s'} · ${Number(value.toFixed(3))} ${unit}³`:'No solids yet. Select closed paths in the drawing, then add an extrusion.';
      status('Preview only. Apply keeps these features; Cancel leaves the drawing unchanged.');
    }
    enable();pump();
  }
  function addExtrusion(){
    if(!source)return status(sourceError,true);
    if(working.features.length>=100)return status('This model already has 100 features.',true);
    const feature={id:crypto.randomUUID(),name:`Extrusion ${working.features.filter(feature=>feature.kind==='extrusion').length+1}`,kind:'extrusion',operation:'new',target:null,height:10,start:0,draft:0,profile:structuredClone(source)};
    working.features.push(feature);activeId=feature.id;needsFit=true;updateList();showFeature();schedule();
  }
  async function open(add=false){
    finish();const thisSession=++session;
    try{working=readModel(getModel());}catch(error){say(error.message);return;}
    activeId=working.features.at(-1)?.id||null;
    source=null;sourceError='';try{source=selectionProfiles(paper,getSelection());}catch(error){sourceError=error.message;}
    unit=getUnit();$('unit').value=unit;$('edge-size').value=format(1);$('edge-mode').value='connected';$('source').textContent=source?`${source.length} selected profile${source.length===1?'':'s'} ready to extrude.`:sourceError;
    $('add').disabled=$('replace').disabled=!source;meshes=[];edges=[];valid=false;needsFit=true;loading=true;exporting=false;updateList();showFeature();populateEdges();onSelection([]);enable();
    dialog.showModal();status('Loading the local 3D engine…');
    try{
      const {createModelViewer}=await import('./model3d-viewer.js');if(thisSession!==session||!dialog.open)return;
      viewer=createModelViewer($('viewer'),onSelection);
      worker=new Worker(new URL('./model3d.worker.js',import.meta.url),{type:'module'});worker.onmessage=receive;
      worker.onerror=()=>{valid=false;inFlight=null;queued=null;loading=false;status('The local 3D engine could not load. Close and reopen the model to retry.',true);enable();};
      loading=false;
      if(add||(!working.features.length&&source))addExtrusion();
      else requestBuild();
    }catch(error){loading=false;status(`Could not open the 3D preview: ${error.message}`,true);enable();}
  }
  entry.onclick=()=>open();extrude.onclick=()=>open(true);$('add').onclick=addExtrusion;
  $('replace').onclick=()=>{const feature=active();if(!source||feature?.kind!=='extrusion')return;feature.profile=structuredClone(source);schedule();};
  for(const id of ['name','height','start','draft','treatment-size'])$(id).addEventListener('input',controlsChanged);
  for(const id of ['operation','target'])$(id).addEventListener('change',controlsChanged);
  $('unit').onchange=()=>{unit=$('unit').value;showFeature();updateList();$('edge-size').value=format(1);if(valid)requestBuild();};
  $('edge-picker').onchange=()=>{const edge=edgeOptions[Number($('edge-picker').value)];if($('edge-picker').value!==''&&edge)viewer?.selectEdge(edge);else viewer?.setSelection([]);};
  $('edge-mode').onchange=()=>{viewer?.setEdgeMode($('edge-mode').value);populateEdges();};
  $('clear-edges').onclick=()=>{viewer?.setSelection([]);$('edge-picker').value='';};
  for(const kind of ['chamfer','fillet'])$(kind).onclick=()=>{
    const amount=$('edge-size').valueAsNumber*unitFactors[unit];
    if(!valid||!edges.length||!Number.isFinite(amount)||amount<=0||amount>1000)return status('Enter an edge size greater than zero and no more than 1000 mm.',true);
    if(edges.length>MAX_TREATMENT_EDGES)return status(`This selection is too complex. Select up to ${MAX_TREATMENT_EDGES} edges per treatment.`,true);
    const feature={id:crypto.randomUUID(),name:`${kind==='chamfer'?'Chamfer':'Fillet'} ${working.features.filter(feature=>feature.kind===kind).length+1}`,kind,target:edges[0].body,edges:edges.map(edge=>edge.key),amount};
    working.features.push(feature);activeId=feature.id;viewer?.setSelection([]);updateList();showFeature();schedule();
  };
  for(const button of dialog.querySelectorAll('[data-model-view]'))button.onclick=()=>viewer?.view(button.dataset.modelView);
  $('fit').onclick=()=>viewer?.view();
  for(const format of ['stl','step'])$(format).onclick=()=>{if(!valid||inFlight||queued||timer||exporting)return;exporting=true;inFlight={id:++sequence,type:'export',format};status(`Preparing ${format.toUpperCase()}…`);enable();worker.postMessage(inFlight);};
  $('apply').onclick=()=>{if(!valid||inFlight||queued||timer||loading||exporting)return;setModel(readModel(working));dialog.close();say('3D model applied. Save an editable SVG to keep the features.');};
  for(const id of ['close','cancel'])$(id).onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{++session;cancelPending();worker?.terminate();worker=null;inFlight=null;viewer?.dispose();viewer=null;entry.focus();});
  return {sync(){extrude.disabled=!getSelection().length;}};
}
