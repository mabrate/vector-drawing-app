import {selectionProfiles,validModel} from './model3d-data.js';
import {drawingPaths,SOURCE_ID,validSourceId} from './model3d-paths.js';

export function sourceItems(paper,items){
  const result=[];
  function visit(item){
    if(item instanceof paper.Group){if(!item.clipped)item.children.forEach(visit);}
    else if(item instanceof paper.PathItem)result.push(item);
  }
  items.forEach(visit);return result;
}

// Winding/start-point differences and SVG decimal rounding do not change the
// identity of an otherwise identical profile. Keep holes distinct from islands.
export function profileKey(profile){
  const wire=curves=>JSON.stringify(curves.map(curve=>{
    const points=curve.map(point=>point.map(n=>Number(n.toFixed(7))));
    const a=JSON.stringify(points),b=JSON.stringify([...points].reverse());return a<b?a:b;
  }).sort());
  return JSON.stringify(profile.map(face=>JSON.stringify([wire(face.outer),face.holes.map(wire).sort()])).sort());
}

export function bindSources(paper,items,bindings){
  const byId=new Map(sourceItems(paper,items).map(item=>[String(item.id),item]));
  for(const {id,sourceId} of bindings){const item=byId.get(id);if(item&&validSourceId(sourceId))item.data[SOURCE_ID]=sourceId;}
}

// Keep the original owner when clones inherit Paper data, even if the copy is
// reordered before its source. Reset owners only when loading/restoring a document.
export function reconcileSources(paper,items,owners=new Map()){
  const sources=new Map(),paths=sourceItems(paper,items),known=new Set(owners.keys()),counts=new Map();
  for(const item of paths){const id=item.data[SOURCE_ID];counts.set(id,(counts.get(id)||0)+1);}
  for(const item of paths){
    const id=item.data[SOURCE_ID];if(!validSourceId(id))continue;
    if(!known.has(id)&&counts.get(id)>1){delete item.data[SOURCE_ID];continue;}
    if(owners.has(id)&&owners.get(id)!==item){delete item.data[SOURCE_ID];continue;}
    owners.set(id,item);sources.set(id,item);
  }
  return sources;
}

export function refreshLinkedModel(paper,items,model,owners=new Map()){
  if(!validModel(model))return {model,changed:false};
  const sources=reconcileSources(paper,items,owners),cache=new Map();let changed=false;
  const features=model.features.map(feature=>{
    if(feature.kind!=='extrusion'||!feature.sourceIds)return feature;
    const profile=[];let sourceError='';
    for(const id of feature.sourceIds){
      if(!cache.has(id)){
        const item=sources.get(id);
        if(!item)cache.set(id,{error:'A linked source path was deleted or replaced. Undo the path edit or select replacement paths in 3D.'});
        else try{cache.set(id,{profile:selectionProfiles(paper,[item])});}
        catch(error){cache.set(id,{error:`A linked source path cannot be extruded. ${error.message}`.slice(0,400)});}
      }
      const source=cache.get(id);if(source.error){sourceError=source.error;break;}profile.push(...source.profile);
    }
    const geometryChanged=!sourceError&&profileKey(profile)!==profileKey(feature.profile);
    if(!geometryChanged&&(feature.sourceError||'')===sourceError)return feature;
    changed=true;const next={...feature};if(geometryChanged)next.profile=profile;
    if(sourceError)next.sourceError=sourceError;else delete next.sourceError;return next;
  });
  if(!changed)return {model,changed:false};
  let next={...model,features};
  if(!validModel(next))next={...model,features:features.map((feature,index)=>feature===model.features[index]?feature:{...model.features[index],sourceError:'The changed source paths exceed the model complexity limit. Simplify them or undo the path edit.'})};
  return {model:next,changed:true};
}

// Old recipes contain copies only. Migrate a feature only when its entire
// profile has an unambiguous counterpart in the current artwork.
export function linkLegacyModel(paper,items,model){
  if(!validModel(model)||!model.features.some(feature=>feature.kind==='extrusion'&&!feature.sourceIds))return {model,bindings:[]};
  const catalog=drawingPaths(paper,items).filter(path=>path.profile),bindings=new Map();
  const features=model.features.map(feature=>{
    if(feature.kind!=='extrusion'||feature.sourceIds)return feature;
    const matches=catalog.filter(path=>profileKey(path.profile)===profileKey(feature.profile));let paths=[];
    if(matches.length===1)paths=matches;
    else if(!matches.length&&feature.profile.length>1){
      const parts=feature.profile.map(face=>catalog.filter(path=>path.profile.length===1&&profileKey(path.profile)===profileKey([face])));
      if(parts.every(matches=>matches.length===1))paths=parts.map(matches=>matches[0]);
    }
    if(!paths.length||new Set(paths.map(path=>path.id)).size!==paths.length)return feature;
    paths.forEach(path=>bindings.set(path.id,{id:path.id,sourceId:path.sourceId}));return {...feature,sourceIds:paths.map(path=>path.sourceId)};
  });
  return {model:{...model,features},bindings:[...bindings.values()]};
}
