import {textGeometry} from './text-format.js';

export function selectedTexts(paper,items){
 return [...new Set(items.flatMap(item=>item instanceof paper.PointText?[item]:item.getItems({class:paper.PointText})))];
}

// Use the same glyph layout as the canvas and simple-path SVG export. Keep
// underline styling separate: text outlines must not add a stroke to it.
export function textToPath(paper,item,loaded){
 const geometry=textGeometry(item,loaded);
 if(!geometry.outlines.length)throw Error('This text has no visible outlines to convert.');
 const outline=new paper.CompoundPath({pathData:geometry.outlines.join(' '),insert:false});
 let result=outline;
 try{
  outline.style=item.style.clone();
  if(geometry.underlines.length){
   result=new paper.Group({children:[outline],insert:false,applyMatrix:false});result.data.objectGroup=true;
   for(const line of geometry.underlines)result.addChild(new paper.Path.Rectangle({rectangle:new paper.Rectangle(line.x,line.y,line.width,line.height),fillColor:item.fillColor||item.strokeColor,strokeColor:null,insert:false}));
  }
  result.applyMatrix=false;result.matrix=item.matrix.clone();
  result.opacity=item.opacity;result.visible=item.visible;result.blendMode=item.blendMode;result.locked=item.locked;result.clipMask=item.clipMask;
  if(item.name)result.name=item.name;
  return result;
 }catch(error){result.remove();throw error;}
}
