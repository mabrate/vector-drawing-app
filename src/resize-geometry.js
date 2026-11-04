import paper from 'paper';
import {cornerModel,refreshCornerAmounts} from './corner-effects.js';
import {restoreShape,shapeRecord} from './shape-building.js';

// Change vector geometry in its own coordinates, keeping the stroke's
// transform and width intact, even inside groups or editable constructions.
export function resizeGeometry(item,matrix,transformStyle=true){
  if(!(item instanceof paper.PathItem)&&!(item instanceof paper.Group&&!item.clipped)){
    item.transform(matrix);return;
  }
  const local=item.matrix.inverted().append(matrix).append(item.matrix);
  const corner=item instanceof paper.Path&&item.data.cornerEffect?cornerModel(item):null;
  if(item instanceof paper.Path)item.segments.forEach(segment=>segment.transform(local));
  else item.children.forEach(child=>resizeGeometry(child,local,!(item instanceof paper.CompoundPath)));
  if(transformStyle&&item instanceof paper.PathItem)for(const color of [item.fillColor,item.strokeColor])if(color?.type==='gradient')color.transform(local);
  if(corner){
    corner.source=corner.source.map(values=>{
      const segment=new paper.Segment(...values);segment.transform(local);
      return [segment.point,segment.handleIn,segment.handleOut].map(p=>[p.x,p.y]);
    });
    corner.geometry=item.pathData;refreshCornerAmounts(item,corner);
  }
  if(item.data.shapeBuild){
    item.data.shapeBuild={...item.data.shapeBuild,parts:item.data.shapeBuild.parts.map(record=>{
      const part=restoreShape(record);
      try{resizeGeometry(part,local);return shapeRecord(part);}finally{part.remove();}
    })};
  }
}
