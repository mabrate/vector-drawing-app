// Preview-only navigation. Capture listeners reserve pan gestures before brush
// or color-sampling handlers run, so moving the view cannot edit the image.
export function installPreviewNavigation({dialog,viewports,isActive,panSelected,dragToPan=()=>false,isEditing,cancelEdit,onPan,onZoom}){
  const pointers=new Map();let gesture=null,space=false;
  const editable=target=>target.closest('input,select,textarea,button,summary,[contenteditable="true"]');
  function sync(){for(const viewport of viewports){viewport.classList.toggle('preview-pan-ready',!!panSelected()||space||dragToPan());viewport.classList.toggle('preview-panning',!!gesture&&gesture.type!=='blocked');}}
  function consume(event){event.preventDefault();event.stopImmediatePropagation();}
  function capture(viewport,id){try{viewport.setPointerCapture(id);}catch{/* The pointer may have ended already. */}}
  function pair(){const [a,b]=[...pointers.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,d:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y))};}
  function reset(){
    const previous=[...pointers.entries()];pointers.clear();gesture=null;space=false;
    for(const [id,point] of previous)try{if(point.viewport.hasPointerCapture(id))point.viewport.releasePointerCapture(id);}catch{}
    sync();
  }
  function move(event){
    const previous=pointers.get(event.pointerId);if(!previous)return;
    pointers.set(event.pointerId,{...previous,x:event.clientX,y:event.clientY});
    if(!gesture)return;
    if(gesture.type==='pinch'&&pointers.size>=2){
      const next=pair();onZoom(next.d/gesture.last.d,gesture.viewport,gesture.last);onPan(next.x-gesture.last.x,next.y-gesture.last.y,gesture.viewport);gesture.last=next;
    }else if(gesture.type==='pan')onPan(event.clientX-previous.x,event.clientY-previous.y,gesture.viewport);
  }
  for(const viewport of viewports){
    viewport.addEventListener('pointerdown',event=>{
      if(!isActive()||![0,1].includes(event.button))return;
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY,viewport,type:event.pointerType});
      if(pointers.size===2&&[...pointers.values()].every(point=>point.type==='touch')){
        cancelEdit();gesture={type:'pinch',viewport,last:pair()};
        for(const id of pointers.keys())capture(viewport,id);sync();consume(event);return;
      }
      if(gesture){consume(event);return;}
      if(event.button===1||space||panSelected()||dragToPan()){
        cancelEdit();viewport.focus({preventScroll:true});gesture={type:'pan',viewport};capture(viewport,event.pointerId);sync();consume(event);
      }
    },true);
    viewport.addEventListener('pointermove',event=>{
      if(!pointers.has(event.pointerId))return;
      if(event.pointerType==='mouse'&&event.buttons===0){
        if(gesture){pointers.delete(event.pointerId);gesture=null;sync();consume(event);}return;
      }
      move(event);if(gesture)consume(event);
    },true);
    function end(event){
      if(!pointers.has(event.pointerId))return;
      const navigating=!!gesture;
      // Touch releases can contain stale coordinates. Keep the last delivered
      // touch position; mouse releases can supply a final move of their own.
      if(navigating&&event.type==='pointerup'&&event.pointerType!=='touch')move(event);
      pointers.delete(event.pointerId);
      if(navigating){gesture=pointers.size?{type:'blocked',viewport}:null;sync();consume(event);}
    }
    viewport.addEventListener('pointerup',end,true);viewport.addEventListener('pointercancel',end,true);
    viewport.addEventListener('lostpointercapture',event=>{
      if(!pointers.has(event.pointerId)||gesture&&event.target!==gesture.viewport)return;
      if(isEditing())cancelEdit();reset();
    },true);
    viewport.addEventListener('wheel',event=>{
      if(!isActive())return;event.preventDefault();event.stopPropagation();if(isEditing()||gesture)return;
      const unit=event.deltaMode===1?16:event.deltaMode===2?viewport.clientHeight:1;
      if(event.ctrlKey||event.metaKey)onZoom(Math.exp(-event.deltaY*unit*.002),viewport,{x:event.clientX,y:event.clientY});
      else onPan(-(event.shiftKey?(event.deltaX||event.deltaY):event.deltaX)*unit,-(event.shiftKey?0:event.deltaY)*unit,viewport);
    },{passive:false});
    viewport.addEventListener('auxclick',event=>{if(event.button===1)event.preventDefault();});
  }
  dialog.addEventListener('keydown',event=>{
    if(!isActive()||event.code!=='Space'&&event.key!==' '||editable(event.target))return;
    space=true;sync();consume(event);
  },true);
  window.addEventListener('keyup',event=>{if(space&&(event.code==='Space'||event.key===' ')){space=false;sync();consume(event);}},true);
  window.addEventListener('blur',()=>{if(isEditing())cancelEdit();reset();});
  dialog.addEventListener('close',()=>{if(isEditing())cancelEdit();reset();});
  return {sync,reset};
}
