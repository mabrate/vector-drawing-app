import {selectionProfiles} from './model3d-data.js';
export const SOURCE_ID='model3dSourceId';
export const validSourceId=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(value);

// Snapshot only artwork supplied by the editor, never its overlay/background
// layers. Compound paths stay intact so counters and nested islands keep holes.
export function drawingPaths(paper,items,selected=[]){
  const paths=[];
  function visit(item,ancestors=[]){
    if(item instanceof paper.Group){if(!item.clipped)item.children.forEach(child=>visit(child,[...ancestors,item]));return;}
    if(!(item instanceof paper.PathItem))return;
    let profile=null,error='';
    try{profile=selectionProfiles(paper,[item]);}catch(reason){error=reason.message;}
    paths.push({id:String(item.id),sourceId:validSourceId(item.data[SOURCE_ID])?item.data[SOURCE_ID]:crypto.randomUUID(),name:item.name||`Path ${paths.length+1}`,profile,error,selected:!error&&[item,...ancestors].some(parent=>selected.includes(parent))});
  }
  items.forEach(item=>visit(item));return paths;
}
