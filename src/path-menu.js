export function installPathMenu({beforeOpen}){
 const button=document.createElement('button');button.id='path-menu-button';button.type='button';button.textContent='Path ▾';button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','path-menu');
 document.getElementById('dimensions-tool').after(button);
 const menu=document.createElement('div');menu.id='path-menu';menu.hidden=true;menu.setAttribute('role','menu');menu.setAttribute('aria-label','Path');
 for(const [selector,label] of [['[data-boolean=unite]','Union'],['[data-boolean=subtract]','Subtract'],['[data-boolean=intersect]','Intersection'],['#offset-path','Offset Path…'],['#stroke-to-path','Stroke to Path']]){
  const action=document.querySelector(selector),icon=action.querySelector('svg');action.replaceChildren();if(icon)action.append(icon);
  const text=document.createElement('span');text.textContent=label;action.append(text);action.hidden=false;action.setAttribute('aria-label',label);action.title=label;action.setAttribute('role','menuitem');action.tabIndex=-1;menu.append(action);
 }
 document.body.append(menu);
 function close(focus=false){menu.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();}
 function position(){if(menu.hidden)return;const r=button.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(r.left,innerWidth-menu.offsetWidth-8))+'px';menu.style.top=Math.max(8,Math.min(r.bottom+6,innerHeight-menu.offsetHeight-8))+'px';}
 function open(){beforeOpen();menu.hidden=false;button.setAttribute('aria-expanded','true');position();}
 const actions=()=>[...menu.querySelectorAll('button:not(:disabled)')];
 button.onclick=()=>menu.hidden?open():close();
 button.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();e.stopPropagation();open();const items=actions();(e.key==='ArrowDown'?items[0]:items.at(-1))?.focus();}});
 menu.addEventListener('click',e=>{if(e.target.closest('button'))close();});
 menu.addEventListener('keydown',e=>{
  e.stopPropagation();
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}
  if(e.key==='Tab'){close();return;}
  const items=actions(),index=items.indexOf(document.activeElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();}
 });
 document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target)&&!button.contains(e.target))close();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){e.preventDefault();e.stopPropagation();close(true);}});
 window.addEventListener('resize',position);document.querySelector('.context').addEventListener('scroll',position);
 return {close};
}
