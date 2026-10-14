// Four-connected, seed-relative color matching prevents a gradual color ramp
// from leaking into unrelated colors. Selection is independent of image alpha.
export function createBackgroundSelection(pixels, width, height) {
  const count=width*height, mask=new Uint8Array(count), covered=new Uint8Array(count), visited=new Uint32Array(count), queue=new Int32Array(count);
  let stamp=0;
  function beginOperation(){covered.fill(0);}
  function flood(seed,tolerance) {
    if(seed<0||seed>=count||covered[seed]||!pixels[seed*4+3])return;
    if(++stamp===0xffffffff){visited.fill(0);stamp=1;}
    const offset=seed*4,limit=3*(tolerance*2.55)**2;
    let head=0,tail=0;queue[tail++]=seed;visited[seed]=stamp;
    while(head<tail){const i=queue[head++],p=i*4;
      if(!pixels[p+3]||(pixels[p]-pixels[offset])**2+(pixels[p+1]-pixels[offset+1])**2+(pixels[p+2]-pixels[offset+2])**2>limit)continue;
      mask[i]=1;covered[i]=1;
      const x=i%width;
      for(const next of [x>0?i-1:-1,x<width-1?i+1:-1,i-width,i+width])
        if(next>=0&&next<count&&visited[next]!==stamp){visited[next]=stamp;queue[tail++]=next;}
    }
  }
  function brush(x,y,radius,mode,tolerance){
    if(mode==='smart'){
      // Sample across the brush as well as its center so drawing can identify
      // more than one contiguous background color.
      const step=Math.max(1,Math.floor(radius/2));
      for(let dy=-radius;dy<=radius;dy+=step)for(let dx=-radius;dx<=radius;dx+=step)
        if(dx*dx+dy*dy<=radius*radius){const xx=Math.round(x+dx),yy=Math.round(y+dy);if(xx>=0&&xx<width&&yy>=0&&yy<height)flood(yy*width+xx,tolerance);}
      flood(Math.round(y)*width+Math.round(x),tolerance);
    }else for(let yy=Math.max(0,Math.floor(y-radius));yy<=Math.min(height-1,Math.ceil(y+radius));yy++)
      for(let xx=Math.max(0,Math.floor(x-radius));xx<=Math.min(width-1,Math.ceil(x+radius));xx++)
        if((xx-x)**2+(yy-y)**2<=radius*radius)mask[yy*width+xx]=mode==='keep'?0:Number(pixels[(yy*width+xx)*4+3]>0);
  }
  return {mask,brush,flood,beginOperation};
}

export function installBackgroundRemoval({getImage,apply,say}){
  const dialog=document.createElement('dialog');dialog.id='background-dialog';dialog.setAttribute('aria-labelledby','background-title');
  dialog.innerHTML=`<div class="background-heading"><h2 id="background-title">Remove background</h2><button id="background-close" aria-label="Close background removal">×</button></div>
    <p>Draw over the background to select connected, similar colors. Use Keep to brush away any selection on your subject.</p>
    <div class="background-controls"><label>Brush <select id="background-mode"><option value="smart">Smart background</option><option value="paint">Select manually</option><option value="keep">Keep / subtract selection</option></select></label>
    <label>Color tolerance <input id="background-tolerance" type="range" min="0" max="100" value="15"><output id="background-tolerance-value">15%</output></label>
    <label>Brush size <input id="background-size" type="range" min="2" max="100" value="16"><output id="background-size-value">16 px</output></label></div>
    <div class="background-actions"><button id="background-edges">Select from edges</button><button id="background-undo">Undo selection</button><button id="background-clear">Clear selection</button><label><input id="background-preview" type="checkbox"> Preview removal</label></div>
    <div class="background-workspace"><canvas id="background-canvas" tabindex="0" aria-label="Paint background selection"></canvas></div>
    <p id="background-feedback" role="status"></p><small>Pink marks areas to remove. Tolerance applies to the next smart stroke or edge selection. This view shows the full image; your crop stays in place.</small>
    <div class="background-footer"><button id="background-cancel">Cancel</button><button id="background-apply" class="primary" disabled>Remove selected background</button></div>`;
  document.body.append(dialog);
  const el=id=>dialog.querySelector(`#background-${id}`),canvas=el('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  let session=null,selection=null,original=null,source=null,undos=[],stroke=null;
  function render(){
    if(!selection)return;
    const display=new ImageData(new Uint8ClampedArray(original.data),canvas.width,canvas.height);let total=0;
    for(let i=0;i<selection.mask.length;i++)if(selection.mask[i]){total++;const p=i*4;if(el('preview').checked)display.data[p+3]=0;else{display.data[p]=Math.round(display.data[p]*.45+237*.55);display.data[p+1]=Math.round(display.data[p+1]*.45+40*.55);display.data[p+2]=Math.round(display.data[p+2]*.45+110*.55);}}
    ctx.putImageData(display,0,0);el('feedback').textContent=`${(total/selection.mask.length*100).toFixed(1)}% selected for removal`;
    el('apply').disabled=!total||!!stroke;el('undo').disabled=!undos.length||!!stroke;el('clear').disabled=!total||!!stroke;el('edges').disabled=!!stroke;
  }
  function remember(){undos.push(selection.mask.slice());if(undos.length>12)undos.shift();}
  function position(e){const r=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width-1,(e.clientX-r.left)*canvas.width/r.width)),y:Math.max(0,Math.min(canvas.height-1,(e.clientY-r.top)*canvas.height/r.height))};}
  function paint(p){const r=stroke.radius,previous=stroke.last||p,steps=Math.max(1,Math.ceil(Math.hypot(p.x-previous.x,p.y-previous.y)/Math.max(1,r/2)));
    for(let i=1;i<=steps;i++)selection.brush(previous.x+(p.x-previous.x)*i/steps,previous.y+(p.y-previous.y)*i/steps,r,stroke.mode,stroke.tolerance);
    stroke.last=p;render();
  }
  canvas.addEventListener('pointerdown',e=>{if(stroke||e.button!==0)return;e.preventDefault();canvas.focus();canvas.setPointerCapture(e.pointerId);remember();selection.beginOperation();stroke={id:e.pointerId,mode:el('mode').value,tolerance:Number(el('tolerance').value),radius:Number(el('size').value)*canvas.width/canvas.getBoundingClientRect().width/2};paint(position(e));});
  canvas.addEventListener('pointermove',e=>{if(stroke?.id===e.pointerId)paint(position(e));});
  function finish(e){if(stroke?.id!==e.pointerId)return;if(e.type==='pointercancel')selection.mask.set(undos.pop());else paint(position(e));stroke=null;render();}
  canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);
  el('edges').onclick=()=>{remember();selection.beginOperation();const w=canvas.width,h=canvas.height,t=Number(el('tolerance').value);for(let x=0;x<w;x++){selection.flood(x,t);selection.flood((h-1)*w+x,t);}for(let y=0;y<h;y++){selection.flood(y*w,t);selection.flood(y*w+w-1,t);}render();};
  el('undo').onclick=()=>{if(undos.length)selection.mask.set(undos.pop());render();};
  el('clear').onclick=()=>{remember();selection.mask.fill(0);render();};el('preview').onchange=render;
  function updateCursor(){const size=Number(el('size').value)+4,center=size/2,radius=(size-4)/2,color=el('mode').value==='keep'?'#267d81':'#ed286e';const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="white" stroke-width="3"/><circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${color}" stroke-width="1"/></svg>`;canvas.style.cursor=`url("data:image/svg+xml,${encodeURIComponent(svg)}") ${center} ${center}, crosshair`;}
  el('mode').onchange=updateCursor;
  for(const key of ['size','tolerance'])el(key).oninput=()=>{el(`${key}-value`).textContent=el(key).value+(key==='size'?' px':'%');updateCursor();};
  for(const key of ['close','cancel'])el(key).onclick=()=>dialog.close();
  dialog.addEventListener('close',()=>{session=selection=original=source=stroke=null;undos=[];canvas.width=canvas.height=1;});
  el('apply').onclick=()=>{
    if(!session||stroke)return;
    try{
      const output=document.createElement('canvas');output.width=source.width;output.height=source.height;const out=output.getContext('2d');out.drawImage(source,0,0);
      const removal=document.createElement('canvas');removal.width=canvas.width;removal.height=canvas.height;const context=removal.getContext('2d'),pixels=context.createImageData(removal.width,removal.height);
      for(let i=0;i<selection.mask.length;i++)pixels.data[i*4+3]=selection.mask[i]?255:0;
      context.putImageData(pixels,0,0);out.globalCompositeOperation='destination-out';out.drawImage(removal,0,0,output.width,output.height);
      apply(session,output);dialog.close();
    }catch{el('feedback').textContent='Could not remove this background. Try again or cancel.';}
  };
  return function open(){
    session=getImage();if(!session)return;
    try{
      source=document.createElement('canvas');source.width=session.canvas.width;source.height=session.canvas.height;source.getContext('2d').drawImage(session.canvas,0,0);
      const scale=Math.min(1,1600/Math.max(source.width,source.height));canvas.width=Math.max(1,Math.round(source.width*scale));canvas.height=Math.max(1,Math.round(source.height*scale));
      ctx.drawImage(source,0,0,canvas.width,canvas.height);original=ctx.getImageData(0,0,canvas.width,canvas.height);selection=createBackgroundSelection(original.data,canvas.width,canvas.height);undos=[];stroke=null;el('preview').checked=false;el('mode').value='smart';dialog.showModal();updateCursor();render();
    }catch{session=selection=original=source=null;say('Could not read this image. Try inserting a local image file.');}
  };
}
