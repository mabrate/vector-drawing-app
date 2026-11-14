import {test,expect} from '@playwright/test';
import paper from 'paper';
import {drawingPaths,SOURCE_ID} from '../src/model3d-paths.js';
import {bindSources,reconcileSources,refreshLinkedModel,linkLegacyModel,profileKey} from '../src/model3d-links.js';
import {readModel,validModel,selectionProfiles} from '../src/model3d-data.js';
test.beforeEach(()=>paper.setup(new paper.Size(1000,1000)));
const extrusion=(id,profile,sourceIds)=>({id,name:id,kind:'extrusion',operation:'new',target:null,height:10,start:0,draft:0,profile,...(sourceIds?{sourceIds}:{})});
function fixture(){
  const path=new paper.Path.Rectangle({rectangle:[0,0,100,80],name:'Source'}),catalog=drawingPaths(paper,[path]),model={version:1,features:[extrusion('body',catalog[0].profile,[catalog[0].sourceId])]};
  bindSources(paper,[path],catalog.map(({id,sourceId})=>({id,sourceId})));return {path,model};
}

test('shared sources rebuild all dependent profiles, including group transforms, without reacting to style',()=>{
  const {path,model}=fixture(),other=new paper.Path.Rectangle([200,0,20,20]),owners=new Map();
  model.features.push({...model.features[0],id:'second',name:'Second'});reconcileSources(paper,[path,other],owners);
  path.fillColor='red';expect(refreshLinkedModel(paper,[path,other],model,owners).changed).toBe(false);
  const group=new paper.Group([path]);group.applyMatrix=false;group.scale(2);group.rotate(23);path.segments[0].point.x+=10;
  const update=refreshLinkedModel(paper,[group,other],model,owners);expect(update.changed).toBe(true);expect(validModel(update.model)).toBe(true);
  expect(update.model.features[0].profile).toEqual(selectionProfiles(paper,[path]));expect(update.model.features[1].profile).toEqual(update.model.features[0].profile);expect(update.model.features[0].sourceIds).toEqual(model.features[0].sourceIds);
  expect(refreshLinkedModel(paper,[group,other],update.model,owners).changed).toBe(false);
});

test('deleted or open sources keep a portable error and recover when their source returns',()=>{
  const {path,model}=fixture(),owners=new Map();reconcileSources(paper,[path],owners);path.closed=false;
  let update=refreshLinkedModel(paper,[path],model,owners);expect(update.model.features[0].sourceError).toMatch(/cannot be extruded/);expect(update.model.features[0].profile).toEqual(model.features[0].profile);expect(()=>readModel(update.model)).not.toThrow();
  path.closed=true;update=refreshLinkedModel(paper,[path],update.model,owners);expect(update.model.features[0].sourceError).toBeUndefined();path.remove();
  update=refreshLinkedModel(paper,[],update.model,owners);expect(update.model.features[0].sourceError).toMatch(/deleted or replaced/);
});

test('duplicates cannot take over links even after reordering or deleting the original',()=>{
  const {path,model}=fixture(),owners=new Map();reconcileSources(paper,[path],owners);
  const copy=path.clone();copy.insertBelow(path);copy.translate([200,0]);let update=refreshLinkedModel(paper,[copy,path],model,owners);
  expect(update.changed).toBe(false);expect(copy.data[SOURCE_ID]).toBeUndefined();expect(path.data[SOURCE_ID]).toBe(model.features[0].sourceIds[0]);
  const another=path.clone();path.remove();update=refreshLinkedModel(paper,[another,copy],model,owners);expect(update.model.features[0].sourceError).toMatch(/deleted/);expect(another.data[SOURCE_ID]).toBeUndefined();
});

test('source identities survive JSON recovery and ambiguous imported identities are rejected',()=>{
  const {path,model}=fixture(),saved=paper.project.activeLayer.exportJSON();paper.project.activeLayer.removeChildren();paper.project.activeLayer.importJSON(saved);
  const restored=paper.project.activeLayer.firstChild;restored.scale(2);let update=refreshLinkedModel(paper,[restored],model);expect(update.changed).toBe(true);expect(update.model.features[0].sourceError).toBeUndefined();
  const copy=restored.clone();update=refreshLinkedModel(paper,[restored,copy],model);expect(update.model.features[0].sourceError).toMatch(/deleted or replaced/);
});

test('old recipes link only to unambiguous matching artwork, including multiple profiles',()=>{
  const a=new paper.Path.Rectangle([0,0,100,80]),b=new paper.Path.Rectangle([200,0,20,20]);const profile=selectionProfiles(paper,[a,b]),model={version:1,features:[extrusion('body',profile)]};
  const migrated=linkLegacyModel(paper,[a,b],model);expect(migrated.model.features[0].sourceIds).toHaveLength(2);expect(migrated.bindings).toHaveLength(2);expect(a.data[SOURCE_ID]).toBeUndefined();
  bindSources(paper,[a,b],migrated.bindings);expect(refreshLinkedModel(paper,[a,b],migrated.model).changed).toBe(false);
  const copy=a.clone();const ambiguous=linkLegacyModel(paper,[a,copy],{version:1,features:[extrusion('single',selectionProfiles(paper,[a]))]});expect(ambiguous.bindings).toEqual([]);expect(ambiguous.model.features[0].sourceIds).toBeUndefined();
  a.reverse();expect(profileKey(selectionProfiles(paper,[a]))).toBe(profileKey(selectionProfiles(paper,[copy])));
});

test('portable link metadata rejects malformed references and error text',()=>{
  const {model}=fixture(),feature=model.features[0];
  for(const patch of [{sourceIds:[]},{sourceIds:['x','x']},{sourceIds:['bad id']},{sourceIds:[null]},{sourceError:4},{sourceError:'x'.repeat(401)}])expect(validModel({...model,features:[{...feature,...patch}]})).toBe(false);
  expect(validModel({...model,features:[{...feature,sourceIds:undefined,sourceError:'missing'}]})).toBe(false);
});
