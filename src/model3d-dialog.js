import {emptyModel,readModel,withoutFeature,MM_PER_PIXEL,MAX_TREATMENT_EDGES,MAX_SHELL_FACES,validModel} from './model3d-data.js';
import {drawingPaths} from './model3d-paths.js';
import {readSTL,MAX_STL_BYTES,MAX_MODEL_TRIANGLES} from './model3d-stl.js';
import {inspectChamfer,selectionContours,chamferLabel} from './model3d-chamfer-intent.js';
import {sealArtwork,snapshotSealArtwork,sealMinimumDiameter,sealError,sealGrid,sealPixels,photoSeal,sealEffect} from './model3d-seal.js';
import './model3d.css';

export function installModel3D({paper,getPaths,getSelection,getModel,setModel,getUnit,finish,say}){
  const dialog=document.createElement('dialog');dialog.id='model3d-dialog';dialog.setAttribute('aria-labelledby','model3d-title');
  const labels={select:'Select',extrude:'Extrude',join:'Join',cut:'Cut',shell:'Shell',chamfer:'Chamfer',fillet:'Fillet',texture:'Texture',seal:'Cylinder seal',stl:'Import STL'};
  dialog.innerHTML=`<div class="model3d-heading"><div><small>3D MODELING</small><h2 id="model3d-title">3D workspace</h2></div><button id="model3d-close" aria-label="Cancel 3D modeling">×</button></div>
    <div id="model3d-tools" role="toolbar" aria-label="Modeling tools">${Object.entries(labels).filter(([tool])=>tool!=='stl').map(([tool,label])=>`<button data-model-tool="${tool}" aria-pressed="false">${label}</button>`).join('')}<button id="model3d-import-stl">Import STL…</button><input id="model3d-stl-file" type="file" accept=".stl,model/stl,application/sla" hidden></div>
    <div class="model3d-layout">
      <aside class="model3d-objects" aria-label="Paths and bodies">
        <details open><summary>Drawing paths <button id="model3d-paths-visibility" type="button">Hide all</button></summary><p class="model3d-help">Closed vector paths on the drawing plane.</p><div id="model3d-paths" class="model3d-object-list"></div></details>
        <details open><summary>Bodies <button id="model3d-bodies-visibility" type="button">Hide all</button></summary><div id="model3d-bodies" class="model3d-object-list"></div></details>
        <small class="model3d-help">Visibility affects this view only. Hidden objects stay in the drawing and CAD exports.</small>
      </aside>
      <section class="model3d-preview-column" aria-label="Model preview">
        <div class="model3d-views" role="group" aria-label="3D views"><button data-model-view="iso">Isometric</button><button data-model-view="top">Top</button><button data-model-view="front">Front</button><button data-model-view="right">Right</button><button id="model3d-fit">Fit</button></div>
        <div id="model3d-viewer"></div><p id="model3d-gesture-help">Drag to orbit · Right-drag or two fingers to pan/zoom</p>
        <div class="model3d-pick-row"><label>Pick <select id="model3d-pick-mode"></select></label><span id="model3d-view-state">Select geometry</span></div>
        <p id="model3d-summary">No solids yet.</p>
      </section>
      <section class="model3d-controls" aria-label="Active modeling tool">
        <label class="model3d-unit">Units <select id="model3d-unit"><option value="mm">mm</option><option value="in">in</option><option value="px">px</option><option value="pt">pt</option></select></label>
        <h3 id="model3d-tool-title">Select</h3><p id="model3d-tool-help" class="model3d-help"></p>
        <div id="model3d-tool-panel" hidden>
          <label>Name <input id="model3d-name" maxlength="100"></label>
          <label id="model3d-target-label">Target body <select id="model3d-target"></select></label>
          <fieldset id="model3d-seal" hidden><legend>Wrapped cylinder seal</legend>
            <label>Artwork <select id="model3d-seal-source"></select></label>
            <canvas id="model3d-seal-artwork" width="256" height="128" aria-label="Seal artwork snapshot"></canvas>
            <p id="model3d-seal-source-size" class="model3d-help"></p>
            <button id="model3d-seal-refresh" type="button">Refresh artwork at full resolution</button>
            <label>Surface <select id="model3d-seal-surface"><option value="photo">Photo STL · high detail</option><option value="cad">CAD / STEP</option></select></label>
            <button id="model3d-seal-photo-detail" type="button">Use fine photo detail (0.05 mm)</button>
            <div class="model3d-pair"><label>Around repeats <input id="model3d-seal-around" type="number" min="1" max="16" step="1"></label><label>Vertical repeats <input id="model3d-seal-vertical" type="number" min="1" max="16" step="1"></label></div>
            <label>Diameter <input id="model3d-seal-diameter" type="number" min="0.0001" step="any"></label>
            <button id="model3d-seal-fit" type="button">Fit diameter to artwork</button>
            <p id="model3d-seal-size" class="model3d-help" role="status"></p>
            <div class="model3d-pair"><label>Top margin <input id="model3d-seal-marginTop" type="number" min="0" step="any"></label><label>Bottom margin <input id="model3d-seal-marginBottom" type="number" min="0" step="any"></label></div>
            <small>Blank bands extend the cylinder above and below the artwork. Artwork and repeats keep their size.</small>
            <label>Relief <select id="model3d-seal-effect"><option value="deboss">Deboss · engraved</option><option value="emboss">Emboss · raised</option></select></label>
            <small>Emboss raises the artwork on the cylinder; Deboss cuts it into the cylinder. Diameter refers to the base cylinder. The impression has the opposite relief.</small>
            <label id="model3d-seal-draft-label">Draft angle (°) <input id="model3d-seal-draftAngle" type="number" min="0" max="80" step="any"></label>
            <small id="model3d-seal-draft-help">Emboss only. 0° is off; 45° gives a 1:1 ramp. Larger angles make gentler slopes for printing the cylinder upright. The base footprint stays fixed and the raised crest narrows; thin details may become lower or disappear. Blank margins stay blank.</small>
            <label>Maximum height / depth <input id="model3d-seal-depth" type="number" min="0.0001" step="any"></label>
            <label>Relief color <select id="model3d-seal-engrave"><option value="darkest">Darkest color</option><option value="lightest">Lightest color</option></select></label>
            <label><input id="model3d-seal-mirror" type="checkbox">Mirror for a readable impression</label>
            <label>Detail size <input id="model3d-seal-detail" type="number" min="0.1" max="5" step="any"></label>
            <small>Width wraps around the cylinder; height runs along its axis. Repeats keep the artwork size. Extra diameter adds a blank section. Color value controls relief: the chosen color reaches the maximum height/depth, the opposite stays at the surface. Transparency stays blank. Artwork is kept as a snapshot; reselect it to refresh after drawing edits.</small>
            <small id="model3d-seal-detail-summary"></small>
          </fieldset>
          <fieldset id="model3d-import" hidden><legend>Imported STL</legend>
            <label>File units <select id="model3d-stl-units"><option value="1">Millimeters</option><option value="25.4">Inches</option><option value="10">Centimeters</option></select></label>
            <p id="model3d-import-summary" class="model3d-help"></p>
            <small>STL has no units; Tinkercad exports normally use millimeters. Closed meshes up to 10,000 triangles and 8 MB are supported. Coplanar triangles become faces; curved regions remain faceted. Chamfers depend on the imported geometry.</small>
          </fieldset>
          <fieldset id="model3d-extrusion" hidden><legend>Extrusion</legend>
            <p id="model3d-source" class="model3d-help"></p>
            <div class="model3d-pair"><label>Height <input id="model3d-height" type="number" step="any" min="0.0001"></label><label>Start height <input id="model3d-start" type="number" step="any"></label></div>
            <label>Draft angle (°) <input id="model3d-draft" type="number" step="any" min="-60" max="60"></label><small>Positive tapers inward; negative expands outward.</small>
          </fieldset>
          <fieldset id="model3d-shell" hidden><legend>Shell walls</legend>
            <label>Wall thickness <input id="model3d-shell-thickness" type="number" step="any" min="0.0001"></label>
            <label>Walls <select id="model3d-shell-direction"><option value="inside">Inside original solid</option><option value="outside">Outside original solid</option></select></label>
            <small>Select one cap for a cup, both caps for a tube. Inside preserves the outside dimensions; outside preserves the cavity.</small>
          </fieldset>
          <fieldset id="model3d-texture" hidden><legend>Printable texture</legend>
            <label>Pattern <select id="model3d-texture-pattern"><option value="ribs">Ribs</option><option value="dots">Round studs / dimples</option><option value="squares">Square studs / pockets</option></select></label>
            <label>Effect <select id="model3d-texture-mode"><option value="raised">Raised</option><option value="engraved">Engraved</option></select></label>
            <label>Height / depth <input id="model3d-texture-depth" type="number" min="0.0001" step="any"></label>
            <label>Width / diameter <input id="model3d-texture-width" type="number" min="0.0001" step="any"></label>
            <label>Spacing <input id="model3d-texture-spacing" type="number" min="0.0001" step="any"></label>
            <label>Angle (°) <input id="model3d-texture-angle" type="number" min="-180" max="180" step="any"></label>
            <small>Real geometry included in STL and STEP. Select flat faces. Width must be smaller than spacing. Up to 256 pattern elements per action; use separate actions for different textures.</small>
          </fieldset>
          <fieldset id="model3d-surface-selection" hidden><legend id="model3d-surface-legend">Surfaces</legend><p id="model3d-face-count"></p><div id="model3d-faces" class="model3d-face-list"></div><button id="model3d-clear-faces">Clear faces</button></fieldset>
          <fieldset id="model3d-edges" hidden><legend>Edge treatment</legend>
            <p class="model3d-help">Tap near a rim, or choose a named boundary below. Hover or focus a name to see it in blue.</p>
            <div id="model3d-boundary-panel"><label>Show <select id="model3d-boundary-filter"><option value="junctions">Design/base junctions</option><option value="upper">Upper rims</option><option value="lower">Lower rims</option><option value="all">All boundaries</option></select></label><div id="model3d-boundaries" aria-label="Rims and junctions"></div></div>
            <p id="model3d-boundary-summary" role="status"></p><p id="model3d-edge-count"></p>
            <div class="model3d-edge-actions"><button id="model3d-focus-edges" type="button">Zoom to selection</button><button id="model3d-clear-edges">Clear edges</button></div>
            <details id="model3d-edge-advanced"><summary>Other edges / individual pieces</summary><label>Selection <select id="model3d-edge-mode"><option value="connected">Connected in plane</option><option value="individual">Individual edges</option></select></label><label>Choose edges <select id="model3d-edge-picker"></select></label></details>
            <label>Size <input id="model3d-edge-size" type="number" step="any" min="0.0001"></label><small>Selected boundaries stay visible in pink through the body. Empty taps keep the selection. Use Clear edges to start again.</small>
            <div id="model3d-chamfer-info" hidden>
              <p id="model3d-chamfer-description" role="status"></p>
              <button id="model3d-chamfer-highlight" type="button" hidden>Highlight short segments</button>
              <label><input id="model3d-chamfer-prepare" type="checkbox">Prepare contour for chamfer</label>
              <small>Simplifies the selected boundary by at most 0.01 mm. The prepared bevel has up to 0.03 mm surface tolerance. Preview before applying.</small>
              <button id="model3d-chamfer-suggest" type="button">Check smaller sizes</button>
              <p id="model3d-chamfer-alternative" role="status" hidden></p><button id="model3d-chamfer-use-size" type="button" hidden></button>
            </div>
          </fieldset>
          <p id="model3d-tool-error" role="status"></p>
          <div class="model3d-tool-actions"><button id="model3d-preview">Preview</button><button id="model3d-edit-selection" hidden>Edit selection</button><button id="model3d-apply-tool" class="primary" disabled>Apply tool</button><button id="model3d-cancel-tool">Cancel tool</button></div>
        </div>
        <details id="model3d-history" open><summary>Feature history</summary><ol id="model3d-features" aria-label="Feature history"></ol></details>
        <small class="model3d-help">Click a feature to edit it. Apply the tool to keep that change in this session; Save model keeps the session in your drawing.</small>
      </section>
    </div>
    <p id="model3d-status" role="status" aria-live="polite"></p>
    <div id="model3d-calculation-actions"><button id="model3d-stop" type="button" hidden>Cancel calculation</button><button id="model3d-retry" type="button" hidden>Retry calculation</button></div>
    <div class="model3d-footer"><div><button id="model3d-stl" disabled>Download STL</button><button id="model3d-step" disabled>Download STEP</button></div><div><button id="model3d-cancel">Cancel</button><button id="model3d-apply" class="primary" disabled>Save model</button></div></div>`;
  document.body.append(dialog);
  const $=id=>dialog.querySelector(`#model3d-${id}`);
  const entry=document.createElement('button');entry.id='model3d-open';entry.textContent='3D model…';document.querySelector('header nav').insertBefore(entry,document.getElementById('save'));
  const extrude=document.createElement('button');extrude.id='extrude-path';extrude.textContent='Extrude…';document.querySelector('.object-actions').append(extrude);
  const factors={mm:1,in:25.4,px:MM_PER_PIXEL,pt:25.4/72};
  let artwork=[],sealSourceId='',sealAround=1,sealSourceError='';
  let working=emptyModel(),catalog=[],pathIds=[],hiddenPaths=new Set(),hiddenBodies=new Set(),bodyId=null;
  let tool='select',draft=null,editingId=null,replacingProfile=false,edges=[],faces=[],edgeOptions=[],pickMode='bodies',previewing=false;
  let viewer=null,worker=null,sequence=0,latestId=0,inFlight=null,queued=null,timer=null,session=0,loading=false,exporting=false;
  let inputMeshes=[],displayMeshes=[],resultModel=null,workingValid=false,inputReady=false,resultValid=false,unit='mm',needsFit=true;
  let watchdog=null,retryRequest=null,pendingSuggestion=null,chamferReport=null,lastFailure=null;
  let boundaryFilterBody=null,boundaryFilterTouched=false;
  const format=value=>String(Number((value/factors[unit]).toFixed(6)));
  const extrusionTool=()=>['extrude','join','cut'].includes(tool);
  const createsBody=()=>['extrude','stl','seal'].includes(tool);
  const faceTool=()=>['shell','texture'].includes(tool);
  const busy=()=>loading||exporting||!!inFlight||!!queued||!!timer;
  const inputModel=()=>editingId?{...working,features:working.features.slice(0,working.features.findIndex(feature=>feature.id===editingId))}:working;
  function status(message,error=false){$('status').textContent=message;$('status').classList.toggle('model3d-error',error);}
  function errorForTool(){
    if(!draft)return '';
    if(tool==='seal')return !draft.source&&sealSourceError||sealError(draft);
    if(extrusionTool()&&replacingProfile&&!pathIds.length)return 'Select one or more visible closed paths in the view or the path list.';
    if(extrusionTool()&&(!Number.isFinite(draft.height)||draft.height<=0||draft.height>10000||!Number.isFinite(draft.start)||Math.abs(draft.start)>10000||!Number.isFinite(draft.draft)||Math.abs(draft.draft)>60))return 'Enter a positive height, a valid start height, and draft between −60° and 60°.';
    if(!createsBody()&&!draft.target)return 'Select a target body.';
    if(!createsBody()&&inputMeshes.find(body=>body.id===draft.target)?.photoSeal)return 'Photo STL seals support engraving edits. Choose CAD / STEP in the seal feature to use solid modeling tools.';
    if(tool==='stl')return Number.isFinite(draft.scale)&&draft.scale>0?'':'Choose the STL file units.';
    if(tool==='texture'){
      if(!faces.length||faces.length>16)return 'Select 1–16 flat faces on a single body.';
      if(![draft.depth,draft.width,draft.spacing].every(n=>Number.isFinite(n)&&n>0&&n<=1000)||draft.width>=draft.spacing)return 'Use positive dimensions up to 1000 mm, with width smaller than spacing.';
      if(!Number.isFinite(draft.angle)||Math.abs(draft.angle)>180)return 'Enter an angle between −180° and 180°.';
      return '';
    }
    if(tool==='shell'&&(!faces.length||faces.length>MAX_SHELL_FACES))return 'Select one or more opening faces on a single body.';
    if(['chamfer','fillet'].includes(tool)&&(!edges.length||edges.length>MAX_TREATMENT_EDGES))return 'Select edges on a single body.';
    const size=tool==='shell'?draft.thickness:draft.amount;
    if(!extrusionTool()&&(!Number.isFinite(size)||size<=0||size>1000))return 'Enter a size greater than zero and no more than 1000 mm.';
    return '';
  }
  function enable(){
    const idle=!busy();
    dialog.setAttribute('aria-busy',String(!idle));
    viewer?.setPickMode(previewing||!idle?'none':pickMode);
    $('apply').disabled=!idle||!workingValid||!!draft;
    $('stl').disabled=$('step').disabled=!idle||!workingValid||!!draft||!working.features.length;
    const hasPhoto=working.features.some(feature=>feature.kind==='seal'&&photoSeal(feature));
    $('step').disabled||=hasPhoto;$('step').title=hasPhoto?'Photo seals export as STL. Choose CAD / STEP in the seal feature for STEP export.':'';
    $('seal-refresh').disabled=loading||exporting||!refreshSealEntry();
    $('preview').disabled=!idle||!inputReady||!!errorForTool();$('apply-tool').disabled=!idle||!resultValid;
    $('edit-selection').hidden=!previewing;$('preview').hidden=previewing;
    $('tool-panel').inert=loading||exporting;
    for(const button of dialog.querySelectorAll('[data-model-tool]'))button.disabled=loading||exporting;
    $('import-stl').disabled=loading||exporting;
    $('pick-mode').disabled=previewing||busy();
    $('clear-faces').disabled=previewing||!faces.length;$('clear-edges').disabled=previewing||!edges.length;
    $('edge-mode').disabled=$('edge-picker').disabled=previewing||!inputReady;
    $('target').disabled=previewing||!inputReady;
    $('tool-error').textContent=errorForTool();
    $('view-state').textContent=previewing?'Result preview':'Select geometry';
    $('stop').hidden=!inFlight;$('retry').hidden=!retryRequest||!idle;
    $('chamfer-suggest').disabled=!idle||!inputReady||tool!=='chamfer'||!!errorForTool();
    $('chamfer-prepare').disabled=!idle||(!chamferReport?.contourMethod&&!$('chamfer-prepare').checked);
    $('chamfer-use-size').disabled=!idle;
    $('chamfer-highlight').disabled=!idle||displayMeshes!==inputMeshes;
    $('boundary-filter').disabled=!idle||previewing||!inputReady;
    $('focus-edges').disabled=!idle||previewing||!edges.length;
    for(const button of $('boundaries').querySelectorAll('button'))button.disabled=!idle||previewing||!inputReady||hiddenBodies.has(draft?.target);
    for(const button of dialog.querySelectorAll('[data-object-pick]'))button.disabled=previewing||busy()||button.dataset.unavailable==='true'||(button.dataset.objectPick==='path'&&!['select','extrude','join','cut'].includes(tool));
  }
  function invalidate(){
    resultValid=false;resultModel=null;clearTimeout(timer);timer=null;queued=null;latestId=++sequence;
    pendingSuggestion=null;lastFailure=null;$('chamfer-alternative').hidden=$('chamfer-use-size').hidden=true;viewer?.setProblemEdges([]);
    retryRequest=null;
  }
  function candidate(){
    if(errorForTool())throw Error(errorForTool());
    const feature=structuredClone(draft);
    if(extrusionTool()&&replacingProfile){
      const paths=catalog.filter(path=>pathIds.includes(path.id));
      feature.profile=paths.flatMap(path=>structuredClone(path.profile));feature.sourceIds=paths.map(path=>path.sourceId);delete feature.sourceError;
    }
    if(faceTool())feature.faces=faces.map(face=>face.key);
    if(['chamfer','fillet'].includes(tool))feature.edges=edges.map(edge=>edge.key);
    if(tool==='chamfer'){
      const selection=selectionContours(inputMeshes.find(body=>body.id===feature.target)?.chamferContours||[],feature.edges);
      if(selection.complete)feature.intent={version:1,contours:selection.contours.map(contour=>contour.intent)};else delete feature.intent;
    }
    const model=editingId?{...working,features:working.features.map(entry=>entry.id===editingId?feature:entry)}:{...working,features:[...working.features,feature]};
    if(!validModel(model))throw Error('Check the feature dimensions, selected paths, and earlier target bodies. A model supports up to 100 features.');
    return model;
  }
  function build(model,purpose){
    clearTimeout(timer);timer=null;
    if(purpose==='idle')workingValid=false;
    queued={id:++sequence,type:'build',model:structuredClone(model),purpose};latestId=queued.id;enable();pump();
  }
  function createWorker(){
    const instance=new Worker(new URL('./model3d.worker.js',import.meta.url),{type:'module'});worker=instance;
    instance.onmessage=event=>{if(worker===instance)receive(event);};
    instance.onerror=()=>{if(worker===instance)abortCalculation('The local 3D engine stopped. Your model and settings are kept. Retry the calculation.',true);};
  }
  function pump(){
    if(inFlight||!queued)return;
    try{if(!worker)createWorker();}catch{retryRequest=queued;queued=null;loading=false;exporting=false;status('The local 3D engine could not start. Your settings are kept. Retry the calculation.',true);enable();return;}
    inFlight=queued;queued=null;retryRequest=null;
    exporting=inFlight.type==='export';
    watchdog=setTimeout(()=>abortCalculation('This calculation exceeded two minutes and was stopped. Your model and settings are kept. Try a smaller size, or retry.',true),120000);
    worker.postMessage(inFlight);enable();
  }
  function abortCalculation(message='Calculation canceled. Your model and settings are kept.',retry=false){
    retryRequest=inFlight?{...inFlight}:null;clearTimeout(watchdog);watchdog=null;worker?.terminate();worker=null;inFlight=null;queued=null;loading=false;exporting=false;
    clearTimeout(timer);timer=null;latestId=++sequence;resultValid=false;pendingSuggestion=null;
    if(previewing&&inputReady){previewing=false;showMeshes(inputMeshes);if(!retry)retryRequest=null;}
    if(message)status(message,true);enable();
  }
  function setPickMode(mode){pickMode=mode;$('pick-mode').value=mode;viewer?.setPickMode(previewing?'none':mode);}
  function pickOptions(){
    const options=['select','stl','seal'].includes(tool)?[['bodies','Bodies'],...(tool==='select'?[['paths','Drawing paths']]:[])]:extrusionTool()?[['paths','Drawing paths'],...(tool==='extrude'?[]:[['bodies','Target body']])]:faceTool()?[['faces',tool==='texture'?'Texture faces':'Opening faces']]:[['edges','Edges']];
    $('pick-mode').replaceChildren(...options.map(([id,label])=>new Option(label,id)));
    setPickMode(options.some(([id])=>id===pickMode)?pickMode:options[0][0]);
  }
  function syncSelection(){viewer?.setSelections({paths:pathIds,edges,faces,body:bodyId});}
  function showObjects(){
    function list(container,items,hidden,type,selected){
      container.replaceChildren();
      if(!items.length){const p=document.createElement('p');p.className='model3d-help';p.textContent=type==='path'?'No vector paths in this drawing.':'No bodies yet.';container.append(p);}
      for(const item of items){
        const row=document.createElement('div');row.className='model3d-object-row';
        const pick=document.createElement('button');pick.textContent=item.name;pick.dataset.objectPick=type;pick.dataset.id=item.id;pick.dataset.unavailable=String(hidden.has(item.id)||!!item.error);pick.title=item.error||item.name;pick.setAttribute('aria-pressed',String(selected(item.id)));if(item.error)pick.textContent+=' (open or unsupported)';
        pick.onclick=()=>{if(type==='path')onPaths(pathIds.includes(item.id)?pathIds.filter(id=>id!==item.id):[...pathIds,item.id]);else onBody(item.id);};
        const toggle=document.createElement('button');toggle.textContent=hidden.has(item.id)?'Show':'Hide';toggle.setAttribute('aria-label',`${toggle.textContent} ${item.name}`);toggle.setAttribute('aria-pressed',String(!hidden.has(item.id)));toggle.onclick=()=>{
          hidden.has(item.id)?hidden.delete(item.id):hidden.add(item.id);
          if(!previewing&&hidden.has(item.id)){
            if(type==='path'&&pathIds.includes(item.id))onPaths(pathIds.filter(id=>id!==item.id));
            if(type==='body'&&bodyId===item.id)onBody(null);
          }
          viewer?.setVisibility({paths:hiddenPaths,bodies:hiddenBodies});populateEdges();showObjects();enable();
        };
        row.append(pick,toggle);container.append(row);
      }
    }
    list($('paths'),catalog,hiddenPaths,'path',id=>pathIds.includes(id));list($('bodies'),displayMeshes,hiddenBodies,'body',id=>bodyId===id);
    $('paths-visibility').textContent=catalog.some(path=>!hiddenPaths.has(path.id))?'Hide all':'Show all';
    $('bodies-visibility').textContent=displayMeshes.some(body=>!hiddenBodies.has(body.id))?'Hide all':'Show all';enable();
  }
  function onPaths(next){
    if(previewing)return;
    pathIds=next.filter(id=>catalog.some(path=>path.id===id&&!path.error)&&!hiddenPaths.has(id));
    if(tool==='select')setPickMode('paths');
    if(draft&&extrusionTool())replacingProfile=true;
    invalidate();syncSelection();showObjects();showSource();enable();
  }
  function onBody(id){
    if(previewing)return;
    if(id&&hiddenBodies.has(id))return;
    bodyId=id;
    if(tool==='select')setPickMode('bodies');
    if(draft&&!createsBody()){
      if(draft.target!==id){edges=[];faces=[];}draft.target=id;
      if(extrusionTool())setPickMode('paths');
    }
    invalidate();syncSelection();populateInputs();showObjects();enable();
  }
  function onEdges(next){if(previewing)return;edges=next;bodyId=edges[0]?.body||bodyId;if(draft)draft.target=edges[0]?.body||bodyId;invalidate();syncSelection();populateInputs();showObjects();enable();}
  function onFaces(next){
    if(previewing)return;
    faces=tool==='texture'?next.filter(item=>inputMeshes.find(body=>body.id===item.body)?.faces.find(face=>face.key===item.key)?.planar):next;
    if(faces.length!==next.length)status('Choose a flat face for printable texture. Curved faces are not supported.',true);
    bodyId=faces[0]?.body||bodyId;if(draft)draft.target=faces[0]?.body||bodyId;invalidate();syncSelection();populateInputs();showObjects();enable();
  }
  function showSource(){
    $('source').textContent=editingId&&!replacingProfile?(draft.sourceIds?'Linked to source paths. Path edits update this feature. Pick paths here to relink it.':'Using a saved profile without a source link. Pick drawing paths to link this feature.'):`${pathIds.length} drawing path${pathIds.length===1?'':'s'} selected. Changes to these paths will update this feature.`;
  }
  function populateEdges(){
    const individual=$('edge-mode').value==='individual';edgeOptions=[];$('edge-picker').replaceChildren(new Option('Pick in preview or choose…',''));
    for(const body of viewer?.edgeChoices()||[]){const group=document.createElement('optgroup');group.label=body.name;body.choices.forEach((edge,index)=>{
      const contour=inputMeshes.find(mesh=>mesh.id===body.id)?.chamferContours.find(contour=>contour.keys.length===edge.keys.length&&contour.keys.every(key=>edge.keys.includes(key)));
      const detail=contour?` · ${chamferLabel(contour.kind)} · Z ${format(contour.z)} ${unit}`:'';
      edgeOptions.push({body:body.id,key:edge.key,chainId:edge.chainId});group.append(new Option(individual?`Edge ${index+1}`:`Chain ${index+1} (${edge.keys.length} edges)${detail}`,String(edgeOptions.length-1)));
    });$('edge-picker').append(group);}
  }
  function populateInputs(){
    const target=draft?.target||bodyId;$('target').replaceChildren(...inputMeshes.map(body=>{const option=new Option(body.name,body.id);option.disabled=hiddenBodies.has(body.id);return option;}));$('target').value=target||'';
    $('edge-count').textContent=`${edges.length} edge${edges.length===1?'':'s'} selected.`;$('face-count').textContent=tool==='texture'?`${faces.length} surface${faces.length===1?'':'s'} selected.`:`${faces.length} opening face${faces.length===1?'':'s'} selected.`;
    const body=inputMeshes.find(body=>body.id===target);$('faces').replaceChildren();
    for(const face of body?.faces||[]){
      const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.value=face.key;input.checked=faces.some(item=>item.body===body.id&&item.key===face.key);input.disabled=previewing||hiddenBodies.has(body.id)||(tool==='texture'&&!face.planar);
      input.onchange=()=>viewer?.selectFace({body:body.id,key:face.key});label.append(input,document.createTextNode(face.label+(tool==='texture'&&!face.planar?' · curved':'')));$('faces').append(label);
    }
    showSource();
    showChamferInfo();
    populateBoundaries();
  }
  function populateBoundaries(){
    const panel=$('boundary-panel'),container=$('boundaries'),individual=$('edge-mode').value==='individual';
    panel.hidden=individual;
    const body=inputMeshes.find(body=>body.id===draft?.target),catalog=body?.chamferContours||[];
    if(boundaryFilterBody!==body?.id){boundaryFilterBody=body?.id;boundaryFilterTouched=false;}
    if(!boundaryFilterTouched)$('boundary-filter').value=catalog.some(contour=>contour.side===1&&contour.kind.endsWith('junction'))?'junctions':'upper';
    const filter=$('boundary-filter').value,selected=new Set(edges.filter(edge=>edge.body===body?.id).map(edge=>edge.key));
    const selection=selectionContours(catalog,[...selected]);
    $('boundary-summary').textContent=selection.contours.length?`${selection.contours.length} complete ${selection.contours.length===1?'boundary':'boundaries'} selected${selection.complete?'.':' plus individual pieces.'}`:edges.length?'Individual edge pieces selected.':'No edges selected.';
    const active=document.activeElement?.closest('[data-boundary]')?.dataset.boundary;container.replaceChildren();
    if(!body||hiddenBodies.has(body.id)){container.textContent='Select a visible target body.';return;}
    const visible=catalog.map((contour,index)=>({...contour,index})).filter(contour=>filter==='all'||filter==='junctions'&&contour.side===1&&contour.kind.endsWith('junction')||filter==='upper'&&contour.side===1&&contour.kind.endsWith('rim')||filter==='lower'&&contour.side===-1&&contour.kind.endsWith('rim')).sort((a,b)=>b.z-a.z||a.kind.localeCompare(b.kind)||a.index-b.index);
    if(!visible.length){container.textContent='No matching complete boundaries. Try All boundaries, or use Other edges.';return;}
    function toggle(contours){
      if(previewing||busy())return;
      const keys=new Set(contours.flatMap(contour=>contour.keys)),current=edges.filter(edge=>edge.body===body.id),chosen=new Set(current.map(edge=>edge.key)),remove=[...keys].every(key=>chosen.has(key));
      viewer?.setSelection(remove?current.filter(edge=>!keys.has(edge.key)):[...current,...[...keys].filter(key=>!chosen.has(key)).map(key=>({body:body.id,key}))]);
    }
    function buttonFor(contours,label,id,detail){
      const button=document.createElement('button');button.type='button';button.dataset.boundary=id;
      button.setAttribute('aria-pressed',String(contours.every(contour=>contour.keys.every(key=>selected.has(key)))));button.disabled=previewing||busy()||!inputReady;
      const name=document.createElement('span');name.textContent=label;button.append(name);if(detail){const small=document.createElement('small');small.textContent=detail;button.append(small);}
      button.onclick=()=>toggle(contours);
      const show=()=>{if(!previewing&&!busy())viewer?.previewEdges(contours.flatMap(contour=>contour.keys.map(key=>({body:body.id,key}))));};
      button.onpointerenter=event=>{if(event.pointerType!=='touch')show();};button.onfocus=show;
      button.onpointerleave=button.onblur=()=>viewer?.previewEdges();return button;
    }
    const groups=new Map();for(const contour of visible){const key=`${contour.z}:${contour.side}:${contour.kind.endsWith('junction')?'junctions':'rims'}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(contour);}
    for(const [groupId,contours] of groups){
      if(contours.length>1){const junctions=contours[0].kind.endsWith('junction');container.append(buttonFor(contours,`All ${junctions?'junctions':'rims'} at Z ${format(contours[0].z)} ${unit}`,`group:${groupId}`,`${contours.length} boundaries`));}
      const counts=new Map();for(const contour of contours){const count=(counts.get(contour.kind)||0)+1;counts.set(contour.kind,count);container.append(buttonFor([contour],`${chamferLabel(contour.kind)} ${count}`,String(contour.index),`Z ${format(contour.z)} ${unit} · ${contour.side===1?'upper':'lower'} · ${contour.keys.length} ${contour.keys.length===1?'piece':'pieces'}`));}
    }
    if(active)container.querySelector(`[data-boundary="${CSS.escape(active)}"]`)?.focus({preventScroll:true});
  }
  function showChamferInfo(){
    const body=inputMeshes.find(body=>body.id===draft?.target);$('chamfer-info').hidden=tool!=='chamfer';
    if(tool!=='chamfer'){chamferReport=null;return;}
    chamferReport=inspectChamfer(body?.chamferContours||[],edges.map(edge=>edge.key),draft.amount,body?.edges.edgeGroups||[],draft.cleanupTolerance||0);
    const details=[edges.length?chamferReport.label+'.':'Select a boundary to inspect it.'],distance=value=>String(Number((value/factors[unit]).toPrecision(4)));
    if(chamferReport.height!==null)details.push(`Available wall height: ${distance(chamferReport.height)} ${unit}.`);
    if(chamferReport.clearance!==null)details.push(`Space to nearby boundaries: ${distance(chamferReport.clearance)} ${unit}.`);
    if(chamferReport.shortEdges.length)details.push(`${chamferReport.shortEdges.length} short segments detected.`);
    if(chamferReport.problem)details.push(chamferReport.problem);
    if(lastFailure)details.push(lastFailure);
    $('chamfer-description').textContent=details.join(' ');$('chamfer-highlight').hidden=!chamferReport.shortEdges.length;
    $('chamfer-prepare').checked=draft.cleanupTolerance===.01;
    $('chamfer-info').dataset.kind=chamferReport.label;$('chamfer-info').dataset.problem=String(!!chamferReport.problem);
  }
  function showImportSummary(){
    if(!draft?.mesh)return;
    const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
    draft.mesh.vertices.forEach((value,index)=>{const axis=index%3;min[axis]=Math.min(min[axis],value);max[axis]=Math.max(max[axis],value);});
    $('import-summary').textContent=`${draft.mesh.triangles.length/3} triangles · ${min.map((value,axis)=>format((max[axis]-value)*draft.scale)).join(' × ')} ${unit}`;
  }
  function showSealDraft(){
    const embossed=sealEffect(draft)==='emboss';
    $('seal-draftAngle').disabled=!embossed;$('seal-draft-help').hidden=!embossed;
    $('seal-draft-label').title=embossed?'Angle from the radial relief direction. 45° gives a 1:1 ramp.':'Draft applies to raised Emboss relief.';
  }
  function showSealSize(){
    if(tool!=='seal')return;
    if(!draft?.source){for(const id of ['seal-source-size','seal-size','seal-detail-summary'])$(id).textContent='';return;}
    const source=draft.source;
    $('seal-source-size').textContent=`Artwork: ${format(source.width)} × ${format(source.height)} ${unit} · ${source.columns} × ${source.rows} samples.`;
    const blank=Math.max(0,draft.diameter*Math.PI-source.width*draft.around);
    const height=source.height*draft.vertical+(draft.marginTop??0)+(draft.marginBottom??0);
    $('seal-size').textContent=`Height ${format(height)} ${unit} · minimum diameter ${format(sealMinimumDiameter(draft))} ${unit} · blank wrap ${format(blank)} ${unit}.`;
    if(!sealError(draft)){
      const grid=sealGrid(draft),photo=photoSeal(draft);
      $('seal-detail-summary').textContent=`${grid.columns} × ${grid.rows} surface cells · ${2*grid.columns*(grid.rows+1)} triangles · surface detail ${format(grid.pitch)} ${unit} · artwork detail ${format(grid.sourcePitch)} ${unit}. `+
        (grid.limited?'Surface limit reached; the actual detail is coarser than requested. ':'')+
        (Math.max(source.columns,source.rows)<=256?'This saved artwork has low resolution. Refresh it from the drawing for photo detail. ':'')+
        (sealEffect(draft)==='emboss'&&draft.draftAngle>0?`Draft ${draft.draftAngle}° tapers the raised edges; details narrower than the taper may lose height. `:'')+
        (photo?'Photo mode keeps the detailed engraving in STL. Choose CAD / STEP for solid modeling tools and STEP export at lower resolution.':'CAD mode limits the surface to 4,608 cells. Use Photo STL for photographic detail.');
    }
    else $('seal-detail-summary').textContent='';
  }
  function showSealFields(){
    $('seal-source').replaceChildren(new Option(draft?.source?`Saved: ${draft.source.name}`:'Choose drawing artwork…',''),...artwork.map(entry=>new Option(entry.name,entry.id)));
    $('seal-source').value=sealSourceId;
    for(const key of ['diameter','depth','detail','marginTop','marginBottom'])$('seal-'+key).value=format(draft[key]??0);
    $('seal-effect').value=sealEffect(draft);$('seal-draftAngle').value=draft.draftAngle??0;
    showSealDraft();
    $('seal-surface').value=draft.surface||'cad';
    $('seal-detail').min=(photoSeal(draft) ? .02 : .1)/factors[unit];$('seal-detail').max=5/factors[unit];
    for(const key of ['around','vertical'])$('seal-'+key).value=draft[key];
    $('seal-engrave').value=draft.engrave;$('seal-mirror').checked=draft.mirror;
    const canvas=$('seal-artwork'),context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);
    if(draft.source){
      const source=draft.source,values=sealPixels(source),pixels=new ImageData(source.columns,source.rows);
      for(let i=0;i<values.length/2;i++){const value=values[i*2];pixels.data.set([value,value,value,values[i*2+1]],i*4);}
      const thumbnail=document.createElement('canvas');thumbnail.width=source.columns;thumbnail.height=source.rows;thumbnail.getContext('2d').putImageData(pixels,0,0);
      const scale=Math.min(canvas.width/source.columns,canvas.height/source.rows);context.drawImage(thumbnail,(canvas.width-source.columns*scale)/2,(canvas.height-source.rows*scale)/2,source.columns*scale,source.rows*scale);
    }
    showSealSize();
  }
  function refreshSealEntry(){
    if(tool!=='seal'||!draft)return null;
    const current=artwork.find(entry=>entry.id===sealSourceId);if(current)return current;
    const matches=artwork.filter(entry=>entry.name===draft.source?.name);return matches.length===1?matches[0]:null;
  }
  function chooseSealSource(id,refresh=false){
    if(!id){sealSourceId='';return;}
    const entry=artwork.find(entry=>entry.id===id);if(!entry)return;
    try{draft.source=snapshotSealArtwork(paper,entry,MM_PER_PIXEL);sealSourceError='';sealSourceId=id;draft.diameter=refresh?Math.max(draft.diameter,sealMinimumDiameter(draft)):sealMinimumDiameter(draft);showSealFields();parametersChanged();}
    catch(error){sealSourceError=error.message||'This artwork could not be read. Reinsert the image and try again.';$('seal-source').value=sealSourceId;status(sealSourceError,true);enable();}
  }
  function showFields(){
    $('tool-title').textContent=(editingId?'Edit ':'')+labels[tool];$('tool-panel').hidden=!draft;
    $('seal').hidden=tool!=='seal';$('extrusion').hidden=!extrusionTool();$('import').hidden=tool!=='stl';$('texture').hidden=tool!=='texture';$('shell').hidden=tool!=='shell';$('surface-selection').hidden=!faceTool();$('surface-legend').textContent=tool==='texture'?'Texture faces':'Opening faces';$('edges').hidden=!['chamfer','fillet'].includes(tool);$('target-label').hidden=!draft||createsBody();
    const help={seal:'Wrap an image or path from the drawing into an engraved rolling seal. Set repeats, diameter and depth, then preview before applying. Insert images into the drawing first.',select:'Choose a modeling tool above, or select a path or body to inspect it. Use Hide to reach geometry behind other objects.',extrude:'Select drawing paths, set the height, then preview and apply the extrusion.',join:'Select drawing paths and a target body. The extrusion adds material to that body.',cut:'Select drawing paths and a target body. The extrusion removes material from that body.',shell:'Select opening faces on a body. Preview the wall thickness before applying the shell.',chamfer:'Select edges or coplanar chains, set their size, then preview the bevel.',fillet:'Select edges or coplanar chains, set their size, then preview the rounding.',texture:'Select flat surfaces, choose a raised or engraved pattern, then preview the printable geometry.',stl:'Import a closed STL as a solid. Preview and apply it, then choose Chamfer, Shell, Texture, or another modeling tool.'};
    $('tool-help').textContent=help[tool];
    for(const button of dialog.querySelectorAll('[data-model-tool]'))button.setAttribute('aria-pressed',String(button.dataset.modelTool===tool));
    if(draft){$('name').value=draft.name;if(tool==='seal')showSealFields();else if(extrusionTool()){for(const key of ['height','start'])$(key).value=format(draft[key]);$('draft').value=draft.draft;}else if(tool==='shell'){$('shell-thickness').value=format(draft.thickness);$('shell-direction').value=draft.direction;}else if(tool==='stl'){$('stl-units').value=String(draft.scale);showImportSummary();}
      else if(tool==='texture'){$('texture-pattern').value=draft.pattern;$('texture-mode').value=draft.mode;for(const key of ['width','spacing','depth'])$('texture-'+key).value=format(draft[key]);$('texture-angle').value=draft.angle;}
      else $('edge-size').value=format(draft.amount);}
    $('import-stl').setAttribute('aria-pressed',String(tool==='stl'));
    $('apply-tool').textContent=editingId?'Apply edit':tool==='stl'?'Apply import':`Apply ${labels[tool].toLowerCase()}`;pickOptions();populateInputs();enable();
  }
  function updateHistory(){
    $('features').replaceChildren();
    for(const feature of working.features){
      const row=document.createElement('li'),button=document.createElement('button'),remove=document.createElement('button');button.textContent=feature.name;button.setAttribute('aria-pressed',String(feature.id===editingId));
      const detail=document.createElement('small');detail.textContent=feature.kind==='seal'?`Cylinder seal · ${sealEffect(feature)==='emboss'?'Emboss':'Deboss'} · ${feature.around} × ${feature.vertical} repeats · Ø ${format(feature.diameter)} ${unit}`:feature.kind==='extrusion'?`${{new:'Extrude',join:'Join',cut:'Cut'}[feature.operation]} · ${format(feature.height)} ${unit}`:feature.kind==='shell'?`Shell · ${format(feature.thickness)} ${unit} · ${feature.direction}`:feature.kind==='stl'?`STL · ${feature.mesh.triangles.length/3} triangles`:feature.kind==='texture'?`${feature.mode} ${feature.pattern} · ${format(feature.depth)} ${unit}`:`${feature.kind} · ${format(feature.amount)} ${unit}`;button.append(detail);button.onclick=()=>beginTool(feature.kind==='extrusion'?{new:'extrude',join:'join',cut:'cut'}[feature.operation]:feature.kind,feature);
      remove.textContent='×';remove.setAttribute('aria-label',`Remove ${feature.name}`);remove.onclick=()=>{cancelDraft(false);working=withoutFeature(working,feature.id);updateHistory();build(working,'idle');};row.append(button,remove);$('features').append(row);
    }
  }
  function beginTool(next,feature=null,mesh=null,nameOverride=null){
    if(inFlight)abortCalculation(null);
    invalidate();tool=next;editingId=feature?.id||null;previewing=false;edges=[];faces=[];inputReady=false;boundaryFilterTouched=false;$('edge-advanced').open=false;
    if(tool==='select'){draft=null;showFields();updateHistory();build(working,'idle');return;}
    const id=feature?.id||crypto.randomUUID(),name=nameOverride||`${labels[tool]} ${working.features.filter(entry=>entry.kind===(extrusionTool()?'extrusion':tool)).length+1}`;
    sealSourceId='';sealSourceError='';
    draft=feature?structuredClone(feature):tool==='seal'?{id,name,kind:'seal',operation:'new',target:null,source:null,surface:'photo',effect:'deboss',draftAngle:0,marginTop:0,marginBottom:0,around:1,vertical:1,diameter:1,depth:1,detail:.1,engrave:'darkest',mirror:true}:tool==='stl'?{id,name,kind:'stl',operation:'new',target:null,scale:1,mesh}:tool==='texture'?{id,name,kind:'texture',target:bodyId,faces:[],pattern:'ribs',mode:'raised',depth:.5,width:1,spacing:4,angle:0}:extrusionTool()?{id,name,kind:'extrusion',operation:{extrude:'new',join:'join',cut:'cut'}[tool],target:tool==='extrude'?null:bodyId,profile:[],height:10,start:0,draft:0}:tool==='shell'?{id,name,kind:'shell',target:bodyId,thickness:1,direction:'inside',faces:[]}:{id,name,kind:tool,target:bodyId,amount:1,edges:[]};
    if(tool==='seal')sealAround=draft.around;
    replacingProfile=!feature;if(feature){pathIds=[];bodyId=feature.target||feature.id;edges=(feature.edges||[]).map(key=>({body:feature.target,key}));faces=(feature.faces||[]).map(key=>({body:feature.target,key}));}
    pickMode=extrusionTool()?'paths':faceTool()?'faces':['stl','seal'].includes(tool)?'bodies':'edges';
    if(tool==='seal'&&!feature){const entry=artwork.find(entry=>entry.selected)||artwork[0];if(entry)try{draft.source=snapshotSealArtwork(paper,entry,MM_PER_PIXEL);sealSourceId=entry.id;draft.diameter=sealMinimumDiameter(draft);}catch(error){sealSourceError=error.message;}}
    showFields();syncSelection();updateHistory();showObjects();status(tool==='stl'?'Choose the file units, then Preview and Apply import.':'Select the geometry for this tool.');build(inputModel(),'input');
  }
  function cancelDraft(rebuild=true){
    invalidate();tool='select';draft=null;editingId=null;previewing=false;edges=[];faces=[];pickMode='bodies';showFields();syncSelection();updateHistory();if(rebuild)build(working,'idle');
  }
  function preview(){
    let model;try{model=candidate();}catch(error){status(error.message,true);enable();return;}
    if(['stl','seal'].includes(tool))needsFit=true;
    previewing=true;resultValid=false;viewer?.setPickMode('none');populateInputs();showObjects();status('Building tool preview…');build(model,'preview');
  }
  function parametersChanged(){
    if(!draft)return;draft.name=$('name').value.trim()||labels[tool];
    if(tool==='seal'){
      draft.surface=$('seal-surface').value;draft.effect=$('seal-effect').value;draft.draftAngle=$('seal-draftAngle').valueAsNumber;
      if(sealEffect(draft)!=='emboss'&&(!Number.isFinite(draft.draftAngle)||draft.draftAngle<0||draft.draftAngle>80)){draft.draftAngle=0;$('seal-draftAngle').value='0';}
      showSealDraft();
      if(!photoSeal(draft)&&$('seal-detail').valueAsNumber*factors[unit]<.1)$('seal-detail').value=format(.1);
      $('seal-detail').min=(photoSeal(draft) ? .02 : .1)/factors[unit];
      const around=$('seal-around').valueAsNumber;
      if(around!==sealAround&&draft.source&&Number.isInteger(around)&&around>0&&around<=16){const blank=Math.max(0,draft.diameter*Math.PI-draft.source.width*sealAround);draft.diameter=(draft.source.width*around+blank)/Math.PI;$('seal-diameter').value=format(draft.diameter);sealAround=around;}
      draft.around=around;draft.vertical=$('seal-vertical').valueAsNumber;
      for(const key of ['diameter','depth','detail','marginTop','marginBottom']){
        const input=$('seal-'+key),previous=draft[key]??0;
        // Unit changes round the display, not the saved physical dimensions.
        draft[key]=input.value===format(previous)?previous:input.valueAsNumber*factors[unit];
      }
      const minDetail=photoSeal(draft) ? .02 : .1;
      if(Math.abs(draft.detail-minDetail)<factors[unit]*.000001)draft.detail=minDetail;
      if(draft.source&&Math.abs(draft.diameter-sealMinimumDiameter(draft))<factors[unit]*.000001)draft.diameter=sealMinimumDiameter(draft);
      draft.engrave=$('seal-engrave').value;draft.mirror=$('seal-mirror').checked;showSealSize();
    }else if(extrusionTool()){draft.height=$('height').valueAsNumber*factors[unit];draft.start=$('start').valueAsNumber*factors[unit];draft.draft=$('draft').valueAsNumber;}
    else if(tool==='shell'){draft.thickness=$('shell-thickness').valueAsNumber*factors[unit];draft.direction=$('shell-direction').value;}
    else if(tool==='texture'){draft.pattern=$('texture-pattern').value;draft.mode=$('texture-mode').value;for(const key of ['width','spacing','depth'])draft[key]=$('texture-'+key).valueAsNumber*factors[unit];draft.angle=$('texture-angle').valueAsNumber;}
    else if(tool==='stl'){draft.scale=Number($('stl-units').value);showImportSummary();}
    else{draft.amount=$('edge-size').valueAsNumber*factors[unit];if(tool==='chamfer'){if($('chamfer-prepare').checked)draft.cleanupTolerance=.01;else delete draft.cleanupTolerance;}}
    pendingSuggestion=null;lastFailure=null;$('chamfer-alternative').hidden=$('chamfer-use-size').hidden=true;showChamferInfo();
    retryRequest=null;
    if(previewing){invalidate();if(!errorForTool()){status('Updating tool preview…');timer=setTimeout(()=>{timer=null;preview();},300);}}enable();
  }
  function showMeshes(next,fit=false){
    displayMeshes=next;viewer?.setMeshes(next,fit);syncSelection();viewer?.setPickMode(previewing?'none':pickMode);populateEdges();showObjects();
    const volume=next.reduce((sum,body)=>sum+body.volume,0)/factors[unit]**3;$('summary').textContent=next.length?`${next.length} solid group${next.length===1?'':'s'} · ${Number(volume.toFixed(3))} ${unit}³`:'No solids yet. Extrude drawing paths or import an STL.';
  }
  function receive(event){
    const result=event.data;if(!inFlight||result.id!==inFlight.id)return;
    if(result.type==='progress'){if(inFlight.id===latestId||inFlight.type==='export')status(result.stage);return;}
    const request=inFlight;inFlight=null;clearTimeout(watchdog);watchdog=null;
    if(request.type==='export'){
      exporting=false;if(result.error)status(result.error,true);else{const url=URL.createObjectURL(result.blob),link=document.createElement('a');link.href=url;link.download=`vector-lab-model.${request.format}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status(`Downloaded ${request.format.toUpperCase()} in millimeters.`);}enable();return;
    }
    if(request.id!==latestId){pump();enable();return;}
    if(request.type==='suggest'){
      pendingSuggestion=result.suggestion||null;$('chamfer-alternative').hidden=false;
      $('chamfer-alternative').textContent=result.error|| (pendingSuggestion?`A ${format(pendingSuggestion.amount)} ${unit} chamfer passed the complete model and watertight-mesh checks. Your requested size is unchanged.`:'None of the smaller sizes passed. Reselect the boundary or try contour preparation.');
      $('chamfer-use-size').hidden=!pendingSuggestion;$('chamfer-use-size').textContent=pendingSuggestion?`Preview ${format(pendingSuggestion.amount)} ${unit}`:'';
      status(result.error||'Size checks finished. Choose a checked alternative or keep editing.',!!result.error);enable();pump();return;
    }
    if(result.error){if(request.purpose==='preview')resultValid=false;else inputReady=false;lastFailure=result.error;showChamferInfo();status(result.error,true);enable();pump();return;}
    if(request.purpose==='preview'){resultModel=result.model||request.model;resultValid=true;lastFailure=null;}
    else{
      inputMeshes=result.meshes;inputReady=true;if(request.purpose==='idle')workingValid=true;
      if(request.purpose==='idle'&&result.model)working=readModel(result.model);
      if(draft&&!createsBody()&&!inputMeshes.some(body=>body.id===draft.target))draft.target=inputMeshes.find(body=>!hiddenBodies.has(body.id))?.id||null;
      if(draft&&!createsBody())bodyId=draft.target;
    }
    showMeshes(result.meshes,needsFit);needsFit=false;populateInputs();
    const tolerance=Math.max(0,...result.meshes.map(body=>body.planarBevelTolerance||0));
    const rebound=result.meshes.some(body=>body.chamfers?.some(chamfer=>chamfer.rebound));
    status((previewing?'Preview only. Apply this tool or return to Edit selection.':draft?'Select geometry, then Preview. Cancel tool discards this operation.':'Choose a tool to model. Save model keeps the session; Cancel discards it.')+(tolerance?` Planar bevel accuracy: ${tolerance} mm.`:'')+(rebound?' A chamfer boundary followed the changed source geometry. Review the preview before saving.':''));enable();pump();
  }
  async function open(shortcut=false){
    finish();const thisSession=++session;
    try{artwork=sealArtwork(paper,[...getPaths()],getSelection());working=readModel(getModel());catalog=drawingPaths(paper,[...getPaths()],getSelection());}catch(error){say(error.message);return;}
    pathIds=catalog.filter(path=>path.selected).map(path=>path.id);hiddenPaths=new Set();hiddenBodies=new Set();bodyId=null;
    tool='select';draft=null;editingId=null;edges=[];faces=[];previewing=false;pickMode='bodies';inputMeshes=[];displayMeshes=[];workingValid=false;resultValid=false;inputReady=false;loading=true;exporting=false;needsFit=true;
    unit=getUnit();$('unit').value=unit;$('edge-mode').value='connected';showFields();updateHistory();showObjects();dialog.showModal();status('Loading the local 3D engine…');
    try{
      const {createModelViewer}=await import('./model3d-viewer.js');if(thisSession!==session||!dialog.open)return;
      viewer=createModelViewer($('viewer'),{onEdges,onFaces,onPaths,onBody});viewer.setPaths(catalog);syncSelection();viewer.view();
      createWorker();
      loading=false;if(shortcut)beginTool('extrude');else build(working,'idle');
    }catch(error){loading=false;status(`Could not open the workspace: ${error.message}`,true);enable();}
  }
  entry.onclick=()=>open();extrude.onclick=()=>open(true);
  $('import-stl').onclick=()=>$('stl-file').click();
  $('stl-file').onchange=async event=>{
    const file=event.target.files[0];event.target.value='';if(!file)return;
    const current=session;loading=true;enable();status('Reading STL triangles…');
    try{
      if(file.size>MAX_STL_BYTES)throw Error('Choose an STL file smaller than 8 MB.');
      const buffer=await file.arrayBuffer();if(current!==session||!dialog.open)return;
      const mesh=readSTL(buffer),total=working.features.reduce((count,feature)=>count+(feature.kind==='stl'?feature.mesh.triangles.length/3:0),mesh.triangles.length/3);
      if(total>MAX_MODEL_TRIANGLES)throw Error('This model would exceed 20,000 imported triangles. Use fewer or simpler STL files.');
      loading=false;beginTool('stl',null,mesh,file.name.replace(/\.stl$/i,'').slice(0,100)||'Imported STL');
    }catch(error){if(current===session&&dialog.open)status(error.message||'Could not read this STL.',true);}
    finally{if(current===session&&dialog.open){loading=false;enable();}}
  };
  for(const button of dialog.querySelectorAll('[data-model-tool]'))button.onclick=()=>beginTool(button.dataset.modelTool);
  $('seal-refresh').onclick=()=>{const entry=refreshSealEntry();if(entry)chooseSealSource(entry.id,true);};
  $('seal-surface').onchange=parametersChanged;
  $('seal-photo-detail').onclick=()=>{$('seal-surface').value='photo';$('seal-detail').value=format(.05);parametersChanged();};
  $('seal-source').onchange=()=>chooseSealSource($('seal-source').value);
  $('seal-fit').onclick=()=>{if(!draft?.source)return;draft.diameter=sealMinimumDiameter(draft);$('seal-diameter').value=format(draft.diameter);parametersChanged();};
  for(const id of ['seal-around','seal-vertical','seal-diameter','seal-depth','seal-detail','seal-marginTop','seal-marginBottom','seal-draftAngle'])$(id).addEventListener('input',parametersChanged);
  for(const id of ['seal-engrave','seal-mirror','seal-effect'])$(id).onchange=parametersChanged;
  for(const id of ['name','height','start','draft','shell-thickness','edge-size','texture-depth','texture-width','texture-spacing','texture-angle'])$(id).addEventListener('input',parametersChanged);
  for(const id of ['shell-direction','texture-pattern','texture-mode','stl-units'])$(id).onchange=parametersChanged;
  $('target').onchange=()=>onBody($('target').value||null);$('pick-mode').onchange=()=>setPickMode($('pick-mode').value);
  $('edge-picker').onchange=()=>{if($('edge-picker').value!=='')viewer?.selectEdge(edgeOptions[Number($('edge-picker').value)]);};
  $('edge-mode').onchange=()=>{viewer?.setEdgeMode($('edge-mode').value);populateEdges();};
  $('boundary-filter').onchange=()=>{boundaryFilterTouched=true;viewer?.previewEdges();populateBoundaries();enable();};
  $('focus-edges').onclick=()=>{viewer?.focusEdges();$('viewer').scrollIntoView({block:'nearest',behavior:'smooth'});};
  $('clear-edges').onclick=()=>viewer?.setSelection([]);$('clear-faces').onclick=()=>viewer?.setFaceSelection([]);
  $('preview').onclick=preview;$('edit-selection').onclick=()=>{invalidate();previewing=false;showFields();showObjects();build(inputModel(),'input');};$('cancel-tool').onclick=()=>{if(inFlight)abortCalculation(null);cancelDraft();};
  $('chamfer-prepare').onchange=parametersChanged;
  $('chamfer-highlight').onclick=()=>viewer?.setProblemEdges(chamferReport.shortEdges.map(key=>({body:draft.target,key})));
  $('chamfer-suggest').onclick=()=>{
    let model;try{model=candidate();}catch(error){status(error.message,true);return;}
    pendingSuggestion=null;$('chamfer-alternative').hidden=$('chamfer-use-size').hidden=true;
    queued={id:++sequence,type:'suggest',model,featureId:draft.id};latestId=queued.id;status('Checking up to three smaller sizes. Cancel to stop.');pump();
  };
  $('chamfer-use-size').onclick=()=>{
    if(!pendingSuggestion)return;const suggestion=pendingSuggestion;draft=structuredClone(suggestion.model.features.find(feature=>feature.id===draft.id));
    $('edge-size').value=format(draft.amount);pendingSuggestion=null;$('chamfer-alternative').hidden=$('chamfer-use-size').hidden=true;
    previewing=true;resultValid=false;populateInputs();showObjects();build(suggestion.model,'preview');
  };
  $('stop').onclick=()=>abortCalculation();$('retry').onclick=()=>{if(!retryRequest)return;queued={...retryRequest,id:++sequence};if(queued.purpose==='preview')previewing=true;latestId=queued.id;retryRequest=null;pump();};
  $('apply-tool').onclick=()=>{
    if(!resultValid||busy())return;working=readModel(resultModel);workingValid=true;inputMeshes=displayMeshes;inputReady=true;
    bodyId=draft.operation==='new'?draft.id:draft.target;cancelDraft(false);populateInputs();showObjects();status('Tool applied to this session. Choose another tool or Save model.');enable();
  };
  $('unit').onchange=()=>{unit=$('unit').value;showFields();updateHistory();showMeshes(displayMeshes);};
  for(const type of ['paths','bodies'])$(type+'-visibility').onclick=event=>{
    event.preventDefault();const items=type==='paths'?catalog:displayMeshes,hidden=type==='paths'?hiddenPaths:hiddenBodies,hide=items.some(item=>!hidden.has(item.id));
    for(const item of items)hide?hidden.add(item.id):hidden.delete(item.id);
    if(!previewing&&hide){if(type==='paths')onPaths([]);else onBody(null);}
    viewer?.setVisibility({paths:hiddenPaths,bodies:hiddenBodies});populateEdges();showObjects();enable();
  };
  for(const button of dialog.querySelectorAll('[data-model-view]'))button.onclick=()=>viewer?.view(button.dataset.modelView);$('fit').onclick=()=>viewer?.view();
  for(const format of ['stl','step'])$(format).onclick=()=>{if(busy()||draft||!workingValid)return;exporting=true;queued={id:++sequence,type:'export',format,model:working};latestId=queued.id;status(`Preparing ${format.toUpperCase()}…`);pump();};
  $('apply').onclick=()=>{if(busy()||draft||!workingValid)return;setModel(readModel(working),catalog.map(({id,sourceId})=>({id,sourceId})).filter(binding=>working.features.some(feature=>feature.sourceIds?.includes(binding.sourceId))));dialog.close();say('3D model saved. Source path edits update linked features. Imported solids and textures are saved too.');};
  for(const id of ['close','cancel'])$(id).onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{++session;invalidate();clearTimeout(watchdog);watchdog=null;retryRequest=null;worker?.terminate();worker=null;inFlight=null;viewer?.dispose();viewer=null;entry.focus();});
  return {sync(){extrude.disabled=!getSelection().length;}};
}
