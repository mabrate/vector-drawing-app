import {colorRanges,defaultAdjustments,hasAdjustments} from './image-adjustments.js';

export function installImageAdjustments({getImage,apply,say}){
  const dialog=document.createElement('dialog');dialog.id='adjust-dialog';dialog.setAttribute('aria-labelledby','adjust-title');
  function slider(id,label,min,max,step=1){return `<div class="adjust-control"><label for="adjust-${id}">${label}</label><div><input id="adjust-${id}" type="range" min="${min}" max="${max}" step="${step}" value="0"><output id="adjust-${id}-value" for="adjust-${id}">0</output></div></div>`;}
  dialog.innerHTML=`<div class="adjust-heading"><h2 id="adjust-title">Adjust image</h2><button id="adjust-close" aria-label="Close image adjustments">×</button></div>
    <div class="adjust-layout"><section class="adjust-preview-column" aria-label="Image preview">
      <div class="adjust-preview"><canvas id="adjust-canvas" role="img" aria-label="Adjusted image preview"></canvas></div>
      <label class="adjust-compare"><input type="checkbox" id="adjust-original"> Show original</label>
      <small>Preview shows the full image. Existing crops stay in place. Undo restores applied changes.</small>
    </section><fieldset id="adjust-controls"><legend class="adjust-sr-only">Image adjustments</legend>
      <label class="adjust-mode" for="adjust-mode">Appearance<select id="adjust-mode"><option value="color">Color</option><option value="gray">Grayscale</option><option value="mono">Black &amp; white</option></select></label>
      ${slider('exposure','Exposure',-3,3,.1)}
      ${slider('contrast','Contrast',-100,100)}
      ${slider('saturation','Saturation',-100,100)}
      <div id="adjust-threshold-control" hidden>${slider('threshold','Black / white threshold',0,255)}</div>
      <fieldset class="adjust-ranges"><legend>Color ranges</legend>
        <label class="adjust-mode" for="adjust-range">Range<select id="adjust-range">${colorRanges.map((name,index)=>`<option value="${index}">${name}</option>`).join('')}</select></label>
        ${slider('range-saturation','Range saturation',-100,100)}
        ${slider('range-brightness','Range brightness',-100,100)}
        <small>Each range keeps its own settings. Brightness also adjusts gray tones. Neutral colors stay neutral.</small>
      </fieldset>
    </fieldset></div>
    <div class="adjust-footer"><button id="adjust-reset">Reset all</button><span id="adjust-status" role="status"></span><button id="adjust-cancel">Cancel</button><button id="adjust-apply" class="primary" disabled>Apply</button></div>`;
  document.body.append(dialog);
  const el=id=>dialog.querySelector(`#adjust-${id}`),canvas=el('canvas'),context=canvas.getContext('2d');
  const globalKeys=['exposure','contrast','saturation','threshold'],rangeKeys=['saturation','brightness'];
  let settings=defaultAdjustments(),session=null,source=null,original=null,worker=null,revision=0,busy=false,pending=false,applying=false,failed=false,frame=null;
  function sync(){
    el('mode').value=settings.mode;
    const color=settings.mode==='color';
    el('saturation').disabled=!color;el('range-saturation').disabled=!color;
    el('threshold-control').hidden=settings.mode!=='mono';
    for(const key of globalKeys){el(key).value=settings[key];el(`${key}-value`).textContent=key==='exposure'?`${settings[key]>0?'+':''}${settings[key].toFixed(1)} stops`:key==='threshold'?settings[key]:`${settings[key]>0?'+':''}${settings[key]}%`;}
    const range=settings.ranges[Number(el('range').value)];
    for(const key of rangeKeys){el(`range-${key}`).value=range[key];el(`range-${key}-value`).textContent=`${range[key]>0?'+':''}${range[key]}%`;}
    el('apply').disabled=applying||failed||!hasAdjustments(settings);
  }
  function sendPreview(){
    if(!worker||applying||failed)return;
    if(busy){pending=true;return;}
    busy=true;pending=false;
    worker.postMessage({type:'preview',id:revision,settings});
  }
  function preview(){
    revision++;
    el('status').textContent=el('original').checked?'Showing original image.':'Updating preview…';
    if(el('original').checked)context.putImageData(original,0,0);
    if(frame!==null)cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{frame=null;sendPreview();});
  }
  function changed(){sync();preview();}
  el('mode').onchange=()=>{settings.mode=el('mode').value;changed();};
  for(const key of globalKeys)el(key).oninput=()=>{settings[key]=Number(el(key).value);changed();};
  for(const key of rangeKeys)el(`range-${key}`).oninput=()=>{settings.ranges[Number(el('range').value)][key]=Number(el(`range-${key}`).value);changed();};
  el('range').onchange=sync;
  el('original').onchange=preview;
  el('reset').onclick=()=>{settings=defaultAdjustments();el('range').value='0';el('original').checked=false;changed();};
  for(const key of ['close','cancel'])el(key).onclick=()=>dialog.close();
  function fail(message){failed=true;busy=false;worker?.terminate();worker=null;el('controls').disabled=false;el('reset').disabled=false;el('original').disabled=false;applying=false;dialog.removeAttribute('aria-busy');sync();el('status').textContent=message;}
  dialog.addEventListener('close',()=>{
    worker?.terminate();worker=null;session=source=original=null;busy=pending=applying=failed=false;
    if(frame!==null)cancelAnimationFrame(frame);frame=null;canvas.width=canvas.height=1;
  });
  el('apply').onclick=()=>{
    if(!session||applying||failed||!hasAdjustments(settings))return;
    try{
      applying=true;el('controls').disabled=true;el('reset').disabled=true;el('original').disabled=true;sync();dialog.setAttribute('aria-busy','true');el('status').textContent='Applying at full resolution…';
      const image=source.getContext('2d').getImageData(0,0,source.width,source.height);
      worker.postMessage({type:'apply',settings,image:{data:image.data,width:image.width,height:image.height}},[image.data.buffer]);
    }catch{fail('Could not apply these adjustments. Cancel and try again.');}
  };
  return function open(){
    session=getImage();if(!session)return;
    try{
      settings=defaultAdjustments();revision=0;busy=pending=applying=failed=false;
      el('controls').disabled=false;el('reset').disabled=false;el('original').disabled=false;el('original').checked=false;el('range').value='0';dialog.removeAttribute('aria-busy');
      source=document.createElement('canvas');source.width=session.canvas.width;source.height=session.canvas.height;source.getContext('2d').drawImage(session.canvas,0,0);
      const scale=Math.min(1,1200/Math.max(source.width,source.height));canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));
      context.drawImage(source,0,0,canvas.width,canvas.height);original=context.getImageData(0,0,canvas.width,canvas.height);
      worker=new Worker(new URL('./image-adjustments.worker.js',import.meta.url),{type:'module'});
      worker.onerror=()=>fail('Could not prepare image adjustments. Cancel and try again.');
      worker.onmessage=({data})=>{
        if(!dialog.open)return;
        if(data.type==='error'){fail(data.message);return;}
        if(data.type==='apply'){
          try{
            const output=document.createElement('canvas');output.width=data.image.width;output.height=data.image.height;
            output.getContext('2d').putImageData(new ImageData(data.image.data,output.width,output.height),0,0);
            apply(session,output);dialog.close();
          }catch{fail('Could not apply these adjustments. Cancel and try again.');}
          return;
        }
        busy=false;
        if(!applying&&data.id===revision){
          if(!el('original').checked)context.putImageData(new ImageData(data.image.data,canvas.width,canvas.height),0,0);
          el('status').textContent=el('original').checked?'Showing original image.':'Preview ready.';
        }
        if(pending&&!applying)sendPreview();
      };
      const pixels=new Uint8ClampedArray(original.data);worker.postMessage({type:'init',image:{data:pixels,width:canvas.width,height:canvas.height}},[pixels.buffer]);
      sync();el('status').textContent='Adjust the image, then choose Apply.';dialog.showModal();
    }catch{
      worker?.terminate();worker=null;session=source=original=null;say('Could not read this image. Try inserting a local image file.');
    }
  };
}
