// Keep sidebar menus inside the page rather than using native OS popups,
// whose coordinates can drift in mobile device emulation.
export function installSidebarSelects(root){
 const controls=[],menu=document.createElement('div');menu.id='sidebar-select-menu';menu.hidden=true;menu.setAttribute('role','listbox');
 const topLayer=typeof menu.showPopover==='function';if(topLayer)menu.setAttribute('popover','manual');document.body.append(menu);
 let active=null;
 function close(focus=false){const previous=active;active=null;if(topLayer&&menu.matches(':popover-open'))menu.hidePopover();menu.hidden=true;previous?.button.setAttribute('aria-expanded','false');if(focus)previous?.button.focus({preventScroll:true});}
 function position(){
  if(!active)return;if(!active.button.getClientRects().length){close();return;}
  const view=window.visualViewport,left=view?.offsetLeft||0,top=view?.offsetTop||0,width=view?.width||innerWidth,height=view?.height||innerHeight,r=active.button.getBoundingClientRect(),gap=6,pad=8;
  if(r.bottom<top||r.top>top+height||r.right<left||r.left>left+width){close();return;}
  menu.style.width=Math.min(320,Math.max(210,r.width),width-2*pad)+'px';
  const below=top+height-r.bottom-gap-pad,above=r.top-top-gap-pad;
  menu.style.maxHeight=Math.max(0,Math.min(360,Math.max(below,above),height-2*pad))+'px';
  const h=menu.offsetHeight,w=menu.offsetWidth,y=h<=below?r.bottom+gap:r.top-gap-h;
  menu.style.left=Math.max(left+pad,Math.min(r.left,left+width-w-pad))+'px';
  menu.style.top=Math.max(top+pad,Math.min(y,top+height-h-pad))+'px';
 }
 function sync(){for(const control of controls){const {select,button,label}=control;button.firstChild.textContent=select.selectedOptions[0]?.textContent||'Choose…';button.disabled=select.disabled;button.setAttribute('aria-label',`${label}: ${button.firstChild.textContent}`);}if(active?.select.disabled)close();}
 function choose(value){const {select}=active;close(true);select.value=value;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));sync();}
 function open(control){
  if(control.select.disabled)return;
  close();sync();active=control;menu.replaceChildren();menu.setAttribute('aria-label',control.label);
  for(const option of control.select.options){if(option.hidden)continue;const row=document.createElement('button');row.type='button';row.setAttribute('role','option');row.textContent=option.textContent;row.dataset.value=option.value;row.disabled=option.disabled;row.setAttribute('aria-selected',String(option.selected));row.onclick=()=>choose(option.value);menu.append(row);}
  menu.hidden=false;if(topLayer)menu.showPopover();control.button.setAttribute('aria-expanded','true');position();
  (menu.querySelector('[aria-selected=true]:not(:disabled)')||menu.querySelector('button:not(:disabled)'))?.focus({preventScroll:true});
 }
 for(const select of root.querySelectorAll('select:not([hidden])')){
  const labelNode=select.closest('label'),copy=labelNode?.cloneNode(true);copy?.querySelectorAll('select,input,button,textarea').forEach(node=>node.remove());
  const label=select.getAttribute('aria-label')||copy?.textContent.trim()||'Choose an option',wrapper=document.createElement('span');wrapper.className='sidebar-select';
  select.before(wrapper);wrapper.append(select);select.tabIndex=-1;select.setAttribute('aria-hidden','true');
  const button=document.createElement('button');button.type='button';button.id=`sidebar-select-${select.id}`;button.className='sidebar-select-button';button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls',menu.id);button.append(document.createTextNode(''),Object.assign(document.createElement('span'),{textContent:'▾'}));button.lastChild.setAttribute('aria-hidden','true');wrapper.append(button);
  if(labelNode?.htmlFor===select.id)labelNode.htmlFor=button.id;
  const control={select,button,label};controls.push(control);
  button.onclick=()=>active===control?close(true):open(control);
  button.onkeydown=e=>{if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();open(control);const rows=[...menu.querySelectorAll('button:not(:disabled)')];if(e.key==='Home')rows[0]?.focus();if(e.key==='End')rows.at(-1)?.focus();}};
  select.addEventListener('focus',()=>button.focus({preventScroll:true}));select.addEventListener('change',sync);
  new MutationObserver(sync).observe(select,{subtree:true,childList:true,attributes:true});
 }
 menu.addEventListener('keydown',e=>{
  e.stopPropagation();
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}
  const rows=[...menu.querySelectorAll('button:not(:disabled)')],index=rows.indexOf(document.activeElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?rows.length-1:(index+(e.key==='ArrowDown'?1:-1)+rows.length)%rows.length;rows[next]?.focus();}
  if(e.key==='Tab')close();
 });
 document.addEventListener('pointerdown',e=>{if(active&&!menu.contains(e.target)&&!active.button.contains(e.target))close();});
 window.addEventListener('resize',position);document.addEventListener('scroll',position,true);window.visualViewport?.addEventListener('resize',position);window.visualViewport?.addEventListener('scroll',position);
 sync();return {sync};
}
