import {defaultCorners,levelingAngle,rotationFrame,validCorners,correctPerspective} from './image-straightening.js';

export function installImageStraightening({getImage,applyLevel,applyPerspective,restore,say}){
  const dialog=document.createElement('dialog');dialog.id='straighten-dialog';dialog.setAttribute('aria-labelledby','straighten-title');
  dialog.innerHTML=`<div class="photo-heading"><h2 id="straighten-title">Straighten image</h2><button id="straighten-close" aria-label="Close straightening">×</button></div>
    <div class="straighten-layout"><section class="straighten-preview" aria-label="Straightening preview"><div id="straighten-surface"><canvas id="straighten-canvas" aria-label="Drag along an edge to level the image"></canvas><svg id="straighten-outline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" hidden><polygon/></svg><div id="straighten-corners" hidden>${['Top left','Top right','Bottom right','Bottom left'].map((name,index)=>`<button type="button" data-corner="${index}" aria-label="${name} corner" title="${name}: drag, or use arrow keys">${index+1}</button>`).join('')}</div></div></section>
    <section class="straighten-controls"><label>Correction<select id="straighten-mode"><option value="level">Level image</option><option value="perspective">Perspective / page corners</option></select></label>
      <div id="straighten-level-controls"><p>Drag a line along an edge that should be level, or adjust the angle.</p>
        <label>Align drawn line to<select id="straighten-direction"><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option></select></label>
        <label for="straighten-angle">Angle (°)</label><div class="straighten-angle"><input id="straighten-angle" type="range" min="-90" max="90" value="0" step="0.1"><input id="straighten-angle-number" aria-label="Angle in degrees" type="number" min="-90" max="90" step="0.1" value="0"></div>
        <label class="photo-check"><input id="straighten-trim" type="checkbox"> Trim empty edges</label>
      </div>
      <div id="straighten-perspective-controls" hidden><p>Drag corners 1–4 around the page, clockwise from the top left. Arrow keys move a focused corner; Shift makes smaller adjustments.</p><div class="straighten-result"><canvas id="straighten-result" aria-label="Corrected perspective preview"></canvas></div><small>Preview of the corrected page. Perspective correction resamples the image. Restore original image recovers the source and its crop.</small></div>
      <label class="photo-check"><input id="straighten-original" type="checkbox"> Show original</label>
      <button id="straighten-restore" hidden>Restore original image</button>
    </section></div>
    <div class="photo-footer"><button id="straighten-reset">Reset</button><span id="straighten-status" role="status"></span><button id="straighten-cancel">Cancel</button><button id="straighten-apply" class="primary" disabled>Apply</button></div>`;
  document.body.append(dialog);
  const el=id=>dialog.querySelector(`#straighten-${id}`),canvas=el('canvas'),context=canvas.getContext('2d'),result=el('result'),surface=el('surface');
  const handles=[...el('corners').children];
  let session=null,source=null,pixels=null,angle=0,corners=defaultCorners(),drag=null,worker=null,busy=false,revision=0,frame=null;
  const perspective=()=>el('mode').value==='perspective';
  const changed=()=>perspective()?corners.some((p,i)=>Math.abs(p.x-defaultCorners()[i].x)+Math.abs(p.y-defaultCorners()[i].y)>.00001):Math.abs(angle)>.00001;
  function fit(){
    const viewport=surface.parentElement;
    surface.style.width=`${Math.max(1,Math.min(viewport.clientWidth-44,(viewport.clientHeight-44)*canvas.width/canvas.height))}px`;
  }
  const observer=new ResizeObserver(()=>{if(dialog.open)fit();});observer.observe(surface.parentElement);
  function setBusy(value){
    busy=value;if(value)dialog.setAttribute('aria-busy','true');else dialog.removeAttribute('aria-busy');
    for(const input of dialog.querySelectorAll('input,select,#straighten-reset,#straighten-restore,[data-corner]'))input.disabled=value;
    el('apply').disabled=value||!changed()||perspective()&&!validCorners(corners);
  }
  function draw(){
    if(!source||!session)return;
    const original=el('original').checked,isPerspective=perspective(),rotation=isPerspective||original?0:angle;
    const box=rotationFrame(source.width,source.height,rotation,!isPerspective&&!original&&el('trim').checked);
    canvas.width=Math.max(1,Math.round(box.width));canvas.height=Math.max(1,Math.round(box.height));
    context.save();context.translate(canvas.width/2,canvas.height/2);context.rotate(rotation*Math.PI/180);context.drawImage(source,-source.width/2,-source.height/2);context.restore();
    if(!isPerspective&&!original){
      context.strokeStyle='#267d8170';context.lineWidth=Math.max(1,canvas.width/900);
      context.beginPath();for(let i=1;i<4;i++){context.moveTo(0,canvas.height*i/4);context.lineTo(canvas.width,canvas.height*i/4);context.moveTo(canvas.width*i/4,0);context.lineTo(canvas.width*i/4,canvas.height);}context.stroke();
    }
    if(drag?.line){context.strokeStyle='#ed286e';context.lineWidth=3*canvas.width/Math.max(1,surface.clientWidth);context.beginPath();context.moveTo(drag.start.x*canvas.width,drag.start.y*canvas.height);context.lineTo(drag.end.x*canvas.width,drag.end.y*canvas.height);context.stroke();}
    el('corners').hidden=!isPerspective||original;el('outline').toggleAttribute('hidden',!isPerspective||original);
    handles.forEach((button,index)=>{button.style.left=`${corners[index].x*100}%`;button.style.top=`${corners[index].y*100}%`;});
    el('outline').querySelector('polygon').setAttribute('points',corners.map(p=>`${p.x*100},${p.y*100}`).join(' '));
    if(isPerspective&&validCorners(corners)){
      const image=correctPerspective(pixels,corners,500);result.width=image.width;result.height=image.height;result.getContext('2d').putImageData(new ImageData(image.data,image.width,image.height),0,0);
    }
    el('level-controls').hidden=isPerspective;el('perspective-controls').hidden=!isPerspective;
    el('angle').value=angle;el('angle-number').value=Number(angle.toFixed(2));
    el('apply').disabled=busy||!changed()||isPerspective&&!validCorners(corners);
    if(!busy)el('status').textContent=isPerspective&&!validCorners(corners)?'Keep the corners in clockwise order around the page.':original?'Showing original image.':'Preview only. Apply saves one Undo step.';
    fit();
  }
  function preview(){if(frame!==null)cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{frame=null;draw();});}
  function position(event){const rect=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width)),y:Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height))};}
  surface.onpointerdown=event=>{
    if(event.button!==0||busy||el('original').checked||drag)return;
    const handle=event.target.closest('[data-corner]');if(perspective()&&!handle)return;
    event.preventDefault();surface.setPointerCapture(event.pointerId);
    const point=position(event);drag={pointerId:event.pointerId,start:point,end:point,line:!perspective(),corner:handle?Number(handle.dataset.corner):null,previous:corners.map(p=>({...p}))};
    if(handle)handle.focus({preventScroll:true});preview();
  };
  surface.onpointermove=event=>{
    if(!drag||event.pointerId!==drag.pointerId)return;
    drag.end=position(event);if(drag.corner!==null)corners[drag.corner]=drag.end;preview();
  };
  function release(event,cancel=false){
    if(!drag||event.pointerId!==drag.pointerId)return;
    const completed=drag;drag=null;
    if(cancel)corners=completed.previous;
    else if(completed.line){
      const rect=canvas.getBoundingClientRect(),a={x:completed.start.x*rect.width,y:completed.start.y*rect.height},p=position(event),b={x:p.x*rect.width,y:p.y*rect.height};
      if(Math.hypot(b.x-a.x,b.y-a.y)>=8){angle+=levelingAngle(a,b,el('direction').value==='vertical');angle=((angle+90)%180+180)%180-90;}
    }
    if(surface.hasPointerCapture(event.pointerId))surface.releasePointerCapture(event.pointerId);preview();
  }
  surface.onpointerup=event=>release(event);surface.onpointercancel=event=>release(event,true);surface.onlostpointercapture=event=>release(event,true);
  handles.forEach((button,index)=>button.onkeydown=event=>{
    const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];if(!delta||busy)return;
    event.preventDefault();const step=event.shiftKey?.001:.01;corners[index]={x:Math.max(0,Math.min(1,corners[index].x+delta[0]*step)),y:Math.max(0,Math.min(1,corners[index].y+delta[1]*step))};preview();
  });
  function updateAngle(value){const number=Number(value);if(value===''||!Number.isFinite(number))return;angle=Math.max(-90,Math.min(90,number));preview();}
  el('angle').oninput=()=>updateAngle(el('angle').value);el('angle-number').oninput=()=>updateAngle(el('angle-number').value);el('angle-number').onblur=()=>{el('angle-number').value=Number(angle.toFixed(2));};
  for(const id of ['mode','trim','original'])el(id).onchange=()=>{drag=null;preview();};
  el('reset').onclick=()=>{angle=0;corners=defaultCorners();el('trim').checked=false;el('original').checked=false;drag=null;draw();};
  for(const id of ['close','cancel'])el(id).onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{
    ++revision;worker?.terminate();worker=null;session=source=pixels=drag=null;busy=false;dialog.removeAttribute('aria-busy');if(frame!==null)cancelAnimationFrame(frame);frame=null;canvas.width=canvas.height=result.width=result.height=1;
  });
  function fail(message){worker?.terminate();worker=null;setBusy(false);el('status').textContent=message;}
  el('apply').onclick=()=>{
    if(!session||busy||!changed())return;
    if(!perspective()){
      try{applyLevel(session,{angle,trim:el('trim').checked});dialog.close();}catch(error){fail(error.message||'Could not straighten this image.');}return;
    }
    if(!validCorners(corners))return;
    try{
      setBusy(true);el('status').textContent='Correcting at full resolution…';
      const request=revision,activeSession=session,points=corners.map(p=>({...p})),full=session.render();
      const image=full.canvas.getContext('2d').getImageData(0,0,full.canvas.width,full.canvas.height);
      worker=new Worker(new URL('./image-straightening.worker.js',import.meta.url),{type:'module'});
      worker.onerror=()=>{if(dialog.open&&request===revision)fail('Could not correct this photo. Try a smaller image.');};
      worker.onmessage=({data})=>{
        if(!dialog.open||request!==revision)return;
        if(data.error){fail(data.error);return;}
        try{
          const output=document.createElement('canvas');output.width=data.image.width;output.height=data.image.height;output.getContext('2d').putImageData(new ImageData(data.image.data,output.width,output.height),0,0);
          applyPerspective(activeSession,output,points,full.scale);dialog.close();
        }catch(error){fail(error.message||'Could not apply perspective correction.');}
      };
      worker.postMessage({image:{data:image.data,width:image.width,height:image.height},corners:points},[image.data.buffer]);
    }catch(error){fail(error.message||'Could not read this image.');}
  };
  el('restore').onclick=async()=>{
    if(!session||busy)return;
    const request=revision;setBusy(true);el('status').textContent='Restoring original image…';
    try{await restore(session,()=>dialog.open&&request===revision);if(dialog.open&&request===revision)dialog.close();}
    catch(error){if(dialog.open&&request===revision)fail(error.message||'Could not restore this image.');}
  };
  return function open(){
    try{
      session=getImage();if(!session)return;source=session.render(1200).canvas;pixels=source.getContext('2d').getImageData(0,0,source.width,source.height);
      angle=0;corners=defaultCorners();drag=null;el('mode').value='level';el('direction').value='horizontal';el('trim').checked=el('original').checked=false;el('restore').hidden=!session.canRestore;
      setBusy(false);dialog.showModal();draw();
    }catch(error){session=source=pixels=null;say(error.message||'Could not prepare this image.');}
  };
}
