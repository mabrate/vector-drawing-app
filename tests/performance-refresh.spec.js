import {test,expect} from '@playwright/test';
test.use({launchOptions:{executablePath:'/usr/bin/google-chrome'}});
test('drag refreshes once per frame, reuses handles, skips unchanged controls and serializes once',async({page})=>{
 await page.goto('/');page.once('dialog',d=>d.accept());await page.locator('#file').setInputFiles({name:'perf.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><path d="M50 40h100v40H50Z" fill="red"/></svg>')});
 await expect(page.locator('#status')).toContainText('SVG opened');await page.keyboard.press('Control+a');
 const box=await page.locator('#canvas').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 const result=await page.evaluate(async()=>{
  const {default:paper}=await import(performance.getEntriesByType('resource').find(e=>e.name.includes('/deps/paper.js')).name);
  await new Promise(requestAnimationFrame);
  const overlay=paper.project.layers[2],art=paper.project.layers[1],ids=overlay.children.map(i=>i.id),canvas=document.querySelector('#canvas'),r=canvas.getBoundingClientRect();
  let frames=0,controls=0,pageLabels=0,serializations=0;
  const update=paper.view.update;paper.view.update=function(...args){frames++;return update.apply(this,args);};
  const cap=document.querySelector('#stroke-cap'),descriptor=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value');
  Object.defineProperty(cap,'value',{configurable:true,get(){return descriptor.get.call(this);},set(value){controls++;descriptor.set.call(this,value);}});
  const observer=new MutationObserver(records=>pageLabels+=records.length);observer.observe(document.querySelector('.page-label'),{childList:true,subtree:true,characterData:true});
  const exportJSON=art.exportJSON;art.exportJSON=function(...args){serializations++;return exportJSON.apply(this,args);};
  for(let i=0;i<40;i++)canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,pointerType:'mouse',buttons:1,clientX:r.x+r.width/2+20+i,clientY:r.y+r.height/2+20,bubbles:true}));
  const immediate=frames;await new Promise(requestAnimationFrame);
  const after=frames,stable=ids.every((id,i)=>overlay.children[i]?.id===id),liveBounds=art.firstChild.bounds.clone();
  canvas.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,pointerType:'mouse',clientX:r.x+r.width/2+59,clientY:r.y+r.height/2+20,bubbles:true}));
  const saved=serializations;await new Promise(requestAnimationFrame);const stopped=frames;await new Promise(requestAnimationFrame);const idle=frames===stopped;
  observer.disconnect();delete cap.value;art.exportJSON=exportJSON;paper.view.update=update;
  return {immediate,after,stable,controls,pageLabels,saved,idle,x:liveBounds.x};
 });
 expect(result.immediate).toBe(0);expect(result.after).toBeLessThanOrEqual(2);expect(result.stable).toBe(true);
 // Pointer release performs one final control synchronization and one shared undo/recovery snapshot.
 expect(result.controls).toBe(1);expect(result.pageLabels).toBe(0);expect(result.saved).toBe(1);expect(result.idle).toBe(true);expect(result.x).toBeGreaterThan(50);
});
