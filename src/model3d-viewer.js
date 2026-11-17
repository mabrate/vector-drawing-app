import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createEdgeSelectionIndex,edgeSelectionGroup,edgeSelectionChoices} from './model3d-edge-selection.js';
import {screenEdgeCandidates} from './model3d-edge-picking.js';
import {chamferLabel} from './model3d-chamfer-intent.js';
import {LineSegments2} from 'three/addons/lines/LineSegments2.js';
import {LineSegmentsGeometry} from 'three/addons/lines/LineSegmentsGeometry.js';
import {LineMaterial} from 'three/addons/lines/LineMaterial.js';

export function createModelViewer(container,{onEdges,onFaces,onPaths,onBody}){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#edf2ef');
  const camera=new THREE.PerspectiveCamera(40,1,.01,100000);camera.up.set(0,0,1);
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.domElement.setAttribute('role','img');renderer.domElement.tabIndex=0;container.append(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;
  const solids=new THREE.Group(),paths=new THREE.Group();scene.add(solids,paths);
  const edgeOverlays=new THREE.Group();scene.add(edgeOverlays);
  const hint=document.createElement('div');hint.className='model3d-edge-hint';hint.hidden=true;hint.setAttribute('aria-hidden','true');container.append(hint);
  scene.add(new THREE.HemisphereLight(0xffffff,0x6b7c79,2.8));
  const light=new THREE.DirectionalLight(0xffffff,2.6);light.position.set(-100,-150,250);scene.add(light);
  let grid=null,meshes=[],selection=[],faceSelection=[],pathSelection=[],bodySelection=null,pickMode='bodies',disposed=false,individualEdges=false;
  let hiddenPaths=new Set(),hiddenBodies=new Set();
  const edgeIndexes=new Map(),colors=['#398b87','#c78248','#7477ab','#7b9e4c','#bd6a7e'];
  let problemEdges=new Set();
  let hoverEdges=[],hoverId='',projected=null,hoverFrame=null;
  const edgeData=new Map(),boundaries=new Map();
  function render(){if(!disposed)renderer.render(scene,camera);}
  function disposeObject(object){object.traverse(child=>{child.geometry?.dispose();for(const material of [].concat(child.material||[]))material.dispose();});}
  function clear(group){for(const child of [...group.children]){disposeObject(child);group.remove(child);}}
  function bounds(){const box=new THREE.Box3();for(const group of [solids,paths])for(const child of group.children)if(child.visible)box.expandByObject(child);return box;}
  function highlight(){
    const chosenEdges=new Set(selection.map(edge=>`${edge.body}:${edge.key}`)),chosenFaces=new Set(faceSelection.map(face=>`${face.body}:${face.key}`));
    for(const child of solids.children){
      if(child.userData.edge){const key=`${child.userData.body}:${child.userData.edge}`,chosen=chosenEdges.has(key),problem=problemEdges.has(key);child.material.color.set(problem?'#e87900':chosen?'#e33f79':'#203c43');child.material.opacity=chosen||problem?1:.68;continue;}
      const body=meshes.find(body=>body.id===child.userData.body),selected=faceSelection.filter(face=>face.body===body.id).map(face=>face.key).sort().join('|');
      if(child.userData.faceHighlight!==selected){
        const attribute=child.geometry.getAttribute('color'),base=child.userData.color,pink=new THREE.Color('#e33f79');
        for(let index=0;index<attribute.count;index++)attribute.setXYZ(index,base.r,base.g,base.b);
        for(const face of body.mesh.faceGroups){
          if(!chosenFaces.has(`${body.id}:${child.userData.faceKeys.get(face.faceId)}`))continue;
          for(let index=face.start;index<face.start+face.count;index++)attribute.setXYZ(body.mesh.triangles[index],pink.r,pink.g,pink.b);
        }
        attribute.needsUpdate=true;child.userData.faceHighlight=selected;
      }
      child.material.emissive.set(body.id===bodySelection?'#143a51':'#000000');
    }
    for(const path of paths.children)path.traverse(child=>{
      if(!child.material)return;
      const chosen=pathSelection.includes(path.userData.path);child.material.color.set(chosen?'#dd6a15':'#426aa1');
      child.material.depthTest=pickMode!=='paths';child.renderOrder=pickMode==='paths'?5:0;
      if(child.isMesh)child.material.opacity=pickMode==='paths'?(chosen?.32:.09):0;
    });
    drawEdgeOverlays();render();
  }
  function drawEdgeOverlays(){
    clear(edgeOverlays);
    const problems=[...problemEdges].map(key=>edgeData.get(key)).filter(Boolean);
    const layers=[[selection,'#e33f79',4],[problems,'#e87900',6],[hoverEdges,'#087eff',5]];
    for(const [index,[chosen,color,width]] of layers.entries()){
      const positions=[];
      for(const edge of chosen){const data=edgeData.get(`${edge.body}:${edge.key}`);if(data&&!hiddenBodies.has(edge.body))for(const value of data.lines)positions.push(value);}
      if(!positions.length)continue;
      const geometry=new LineSegmentsGeometry().setPositions(positions),material=new LineMaterial({color,linewidth:width,depthTest:false,depthWrite:false,transparent:true,opacity:.95});
      material.resolution.set(container.clientWidth,container.clientHeight);
      const line=new LineSegments2(geometry,material);line.renderOrder=10+index;line.frustumCulled=false;edgeOverlays.add(line);
    }
  }
  function previewEdges(next=[]){
    hoverEdges=next;hoverId='';hint.hidden=true;drawEdgeOverlays();render();
  }
  function setSelection(next,notify=true){selection=next;highlight();if(notify)onEdges(next);}
  function setFaceSelection(next,notify=true){faceSelection=next;highlight();if(notify)onFaces(next);}
  function setPathSelection(next,notify=true){pathSelection=next;highlight();if(notify)onPaths(next);}
  function setBodySelection(id,notify=true){bodySelection=id;highlight();if(notify)onBody(id);}
  function setSelections(next){selection=next.edges;faceSelection=next.faces;pathSelection=next.paths;bodySelection=next.body;highlight();}
  function setVisibility({paths:nextPaths,bodies:nextBodies}){
    hiddenPaths=nextPaths;hiddenBodies=nextBodies;
    for(const child of paths.children)child.visible=!hiddenPaths.has(child.userData.path);
    for(const child of solids.children)child.visible=!hiddenBodies.has(child.userData.body);
    projected=null;previewEdges();drawEdgeOverlays();render();
  }
  function setPickMode(mode){
    if(mode!==pickMode)previewEdges();
    pickMode=mode;renderer.domElement.setAttribute('aria-label',`3D workspace. Drag to orbit; two fingers or right-drag to pan and zoom. ${mode==='none'?'Result preview. Return to selection to change inputs.':`Tap to select ${mode}.`}`);highlight();
  }
  function resize(){const {width,height}=container.getBoundingClientRect();if(width<1||height<1)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();projected=null;drawEdgeOverlays();render();}
  const observer=new ResizeObserver(resize);observer.observe(container);
  function view(name='iso'){
    const box=bounds(),center=box.isEmpty()?new THREE.Vector3():box.getCenter(new THREE.Vector3());
    const span=box.isEmpty()?100:Math.max(...box.getSize(new THREE.Vector3()).toArray(),1);
    const direction={iso:[1,-1,1],top:[0,0,1],front:[0,-1,0],right:[1,0,0]}[name]||[1,-1,1];
    const distance=span/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*1.5/Math.min(camera.aspect,1);
    controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance));
    camera.near=Math.max(.001,distance/10000);camera.far=Math.max(1000,distance*100);camera.updateProjectionMatrix();controls.update();render();
  }
  function updateGrid(){
    if(grid){scene.remove(grid);disposeObject(grid);}
    const box=bounds(),center=box.isEmpty()?new THREE.Vector3():box.getCenter(new THREE.Vector3()),extent=box.isEmpty()?100:Math.max(...box.getSize(new THREE.Vector3()).toArray(),10);
    grid=new THREE.GridHelper(extent*2,20,0xb8c7c0,0xd3dfd8);grid.rotation.x=Math.PI/2;grid.position.set(center.x,center.y,box.isEmpty()?-.02:Math.min(0,box.min.z)-.02);scene.add(grid);
  }
  function setPaths(catalog){
    clear(paths);
    function curvePath(curves,Type=THREE.Path){
      const path=new Type();path.moveTo(...curves[0][0]);
      for(const [,a,b,end] of curves)path.bezierCurveTo(...a,...b,...end);
      path.closePath();return path;
    }
    for(const entry of catalog){
      if(!entry.profile)continue;
      const object=new THREE.Group();object.userData.path=entry.id;
      for(const profile of entry.profile){
        const shape=curvePath(profile.outer,THREE.Shape);shape.holes=profile.holes.map(wire=>curvePath(wire));
        const surface=new THREE.Mesh(new THREE.ShapeGeometry(shape,24),new THREE.MeshBasicMaterial({color:'#426aa1',side:THREE.DoubleSide,transparent:true,opacity:.09,depthWrite:false}));surface.userData.path=entry.id;object.add(surface);
        for(const wire of [shape,...shape.holes]){
          const geometry=new THREE.BufferGeometry().setFromPoints(wire.getPoints(24).map(point=>new THREE.Vector3(point.x,point.y,0)));
          const line=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:'#426aa1',transparent:true,opacity:.9,depthWrite:false}));line.userData.path=entry.id;object.add(line);
        }
      }
      paths.add(object);
    }
    setVisibility({paths:hiddenPaths,bodies:hiddenBodies});highlight();updateGrid();
  }
  function setMeshes(next,fit=false){
    edgeData.clear();boundaries.clear();projected=null;hoverEdges=[];hoverId='';hint.hidden=true;
    meshes=next;edgeIndexes.clear();for(const body of next)edgeIndexes.set(body.id,createEdgeSelectionIndex(body.edges));clear(solids);
    next.forEach((body,index)=>{
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(body.mesh.vertices,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(body.mesh.normals,3));geometry.setIndex(ArrayBuffer.isView(body.mesh.triangles)?new THREE.BufferAttribute(body.mesh.triangles,1):body.mesh.triangles);
      geometry.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(body.mesh.vertices.length),3));
      const settings={roughness:.55,metalness:.05,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1};
      // Color selected faces through vertex colors, keeping even finely faceted
      // CAD bodies in one draw call rather than a material group per face.
      const surface=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({...settings,vertexColors:true}));surface.userData={body:body.id,color:new THREE.Color(colors[index%colors.length]),faceKeys:new Map(body.faces.map(face=>[face.faceId,face.key]))};solids.add(surface);
      for(const edge of body.edges.edgeGroups){
        if(!edge.key)continue;
        const lines=body.edges.lines.slice(edge.start*3,(edge.start+edge.count)*3);edgeData.set(`${body.id}:${edge.key}`,{body:body.id,key:edge.key,lines});
        const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(lines,3));
        const line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#203c43',transparent:true,opacity:.68}));line.userData={body:body.id,edge:edge.key};solids.add(line);
      }
      for(const contour of body.chamferContours||[])for(const key of contour.keys)boundaries.set(`${body.id}:${key}`,contour);
    });
    setVisibility({paths:hiddenPaths,bodies:hiddenBodies});highlight();updateGrid();if(fit)view();else render();
  }
  function selectEdge(item,{toggle=false,normal=null}={}){
    const index=edgeIndexes.get(item?.body),chain=index&&(index.groups.get(item.chainId)||edgeSelectionGroup(index,item.key,{individual:individualEdges,normal}));
    if(!chain){setSelection([]);return;}
    const picked=chain.keys.map(key=>({body:item.body,key}));if(!toggle){setSelection(picked);return;}
    const next=selection.filter(entry=>entry.body===item.body),keys=new Set(chain.keys),selected=new Set(next.map(entry=>entry.key));
    setSelection(chain.keys.every(key=>selected.has(key))?next.filter(entry=>!keys.has(entry.key)):[...next,...picked.filter(entry=>!selected.has(entry.key))]);
  }
  function selectFace(item){const next=faceSelection.filter(face=>face.body===item.body);setFaceSelection(next.some(face=>face.key===item.key)?next.filter(face=>face.key!==item.key):[...next,item]);}
  function projectEdges(rect){
    if(projected)return projected;
    camera.updateMatrixWorld();const matrix=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),result=[];
    const project=point=>{const p=new THREE.Vector4(...point,1).applyMatrix4(matrix);return {x:(p.x/p.w+1)*rect.width/2,y:(1-p.y/p.w)*rect.height/2,z:p.z/p.w,w:p.w};};
    for(const data of edgeData.values()){
      if(hiddenBodies.has(data.body))continue;
      for(let i=0;i<data.lines.length;i+=6){const start=Array.from(data.lines.slice(i,i+3)),end=Array.from(data.lines.slice(i+3,i+6));result.push({body:data.body,key:data.key,start,end,a:project(start),b:project(end),boundary:boundaries.has(`${data.body}:${data.key}`)});}
    }
    projected=result;return result;
  }
  function edgeAt(event){
    const rect=renderer.domElement.getBoundingClientRect(),point={x:event.clientX-rect.left,y:event.clientY-rect.top},ray=new THREE.Raycaster();
    const candidates=screenEdgeCandidates(projectEdges(rect),point,{radius:event.pointerType==='touch'?24:12,preferBoundaries:!individualEdges});
    const surfaces=solids.children.filter(child=>child.visible&&child.isMesh);
    for(const candidate of candidates.slice(0,64)){
      const position=new THREE.Vector3(...candidate.start).lerp(new THREE.Vector3(...candidate.end),candidate.u);
      ray.setFromCamera(new THREE.Vector2(candidate.x/rect.width*2-1,1-candidate.y/rect.height*2),camera);
      const surface=ray.intersectObjects(surfaces,false)[0],distance=position.distanceTo(ray.ray.origin);
      const tolerance=distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*1.5/rect.height+1e-5;
      if(surface&&distance>surface.distance+tolerance)continue;
      const index=edgeIndexes.get(candidate.body),boundary=!individualEdges&&boundaries.get(`${candidate.body}:${candidate.key}`);
      const chain=boundary?{id:`boundary:${boundary.keys[0]}`,keys:boundary.keys}:edgeSelectionGroup(index,candidate.key,{individual:individualEdges,normal:surface?.face?.normal.toArray()});
      if(chain)return {...candidate,chain,boundary};
    }
    return null;
  }
  function hover(event){
    if(disposed||pickMode!=='edges'||event.buttons||pointers.size){previewEdges();return;}
    const hit=edgeAt(event),id=hit?`${hit.body}:${hit.chain.id}`:'';
    if(id!==hoverId){hoverId=id;hoverEdges=hit?hit.chain.keys.map(key=>({body:hit.body,key})):[];drawEdgeOverlays();render();}
    hint.hidden=!hit;
    if(hit){hint.textContent=(hit.boundary?chamferLabel(hit.boundary.kind):individualEdges?'Edge':'Connected edges')+' · Click to select or remove';
      const rect=renderer.domElement.getBoundingClientRect();hint.style.left=`${Math.max(8,Math.min(event.clientX-rect.left+14,rect.width-hint.offsetWidth-8))}px`;hint.style.top=`${Math.max(8,Math.min(event.clientY-rect.top+16,rect.height-hint.offsetHeight-8))}px`;}
  }
  function focusEdges(){
    const box=new THREE.Box3();
    for(const edge of selection){const data=edgeData.get(`${edge.body}:${edge.key}`);if(data&&!hiddenBodies.has(edge.body))for(let i=0;i<data.lines.length;i+=3)box.expandByPoint(new THREE.Vector3(...data.lines.slice(i,i+3)));}
    if(box.isEmpty())return;
    const direction=camera.position.clone().sub(controls.target).normalize(),span=Math.max(...box.getSize(new THREE.Vector3()).toArray(),1);
    const distance=span/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*1.5/Math.min(camera.aspect,1);
    controls.target.copy(box.getCenter(new THREE.Vector3()));camera.position.copy(controls.target).addScaledVector(direction,distance);camera.near=Math.max(.001,distance/10000);camera.far=Math.max(1000,distance*100);camera.updateProjectionMatrix();projected=null;controls.update();render();
  }
  let down;const pointers=new Set();
  renderer.domElement.addEventListener('pointerdown',event=>{pointers.add(event.pointerId);down=pointers.size===1&&event.button===0?{x:event.clientX,y:event.clientY,id:event.pointerId}:null;});
  renderer.domElement.addEventListener('pointerup',event=>{
    pointers.delete(event.pointerId);if(!down||down.moved||down.id!==event.pointerId||Math.hypot(event.clientX-down.x,event.clientY-down.y)>(event.pointerType==='touch'?10:5))return;
    down=null;if(pickMode==='none')return;
    if(pickMode==='edges'){
      const hit=edgeAt(event);if(!hit)return; // A missed tap never clears work.
      const picked=hit.chain.keys.map(key=>({body:hit.body,key})),keys=new Set(hit.chain.keys),next=selection.filter(edge=>edge.body===hit.body),all=picked.every(edge=>next.some(other=>other.key===edge.key));
      setSelection(all?next.filter(edge=>!keys.has(edge.key)):[...next,...picked.filter(edge=>!next.some(other=>other.key===edge.key))]);previewEdges();return;
    }
    const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();ray.params.Line.threshold=camera.position.distanceTo(controls.target)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*10/rect.height;
    ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
    // Path tools can pick through a solid above the drawing plane. Visibility
    // still excludes both hidden objects and their descendants from ray tests.
    const hits=ray.intersectObjects((pickMode==='paths'?paths:solids).children.filter(child=>child.visible),true);
    if(pickMode==='paths'){
      const hit=hits.find(hit=>hit.object.userData.path);if(!hit)return;
      const id=hit.object.userData.path;setPathSelection(pathSelection.includes(id)?pathSelection.filter(key=>key!==id):[...pathSelection,id]);return;
    }
    const surface=hits.find(hit=>hit.object.isMesh);
    if(pickMode==='bodies'){setBodySelection(surface?.object.userData.body||null);return;}
    if(pickMode==='faces'){
      if(!surface)return;
      const body=meshes.find(body=>body.id===surface.object.userData.body),triangle=surface.faceIndex*3;
      const group=body.mesh.faceGroups.find(face=>triangle>=face.start&&triangle<face.start+face.count),face=body.faces.find(face=>face.faceId===group?.faceId);
      if(face)selectFace({body:body.id,key:face.key});return;
    }
  });
  renderer.domElement.addEventListener('pointermove',event=>{
    if(down&&Math.hypot(event.clientX-down.x,event.clientY-down.y)>(event.pointerType==='touch'?10:5))down.moved=true;
    if(event.pointerType!=='mouse')return;
    cancelAnimationFrame(hoverFrame);hoverFrame=requestAnimationFrame(()=>hover(event));
  });
  renderer.domElement.addEventListener('pointerleave',()=>{cancelAnimationFrame(hoverFrame);previewEdges();});
  renderer.domElement.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);down=null;previewEdges();});controls.addEventListener('change',()=>{projected=null;previewEdges();render();});resize();view();
  return {setMeshes,setPaths,setSelection,setFaceSelection,setPathSelection,setBodySelection,setSelections,setVisibility,setPickMode,selectEdge,selectFace,
    setProblemEdges(edges){problemEdges=new Set(edges.map(edge=>`${edge.body}:${edge.key}`));highlight();},
    previewEdges,focusEdges,
    setEdgeMode(mode){individualEdges=mode==='individual';setSelection([]);},
    edgeChoices(){return meshes.filter(body=>!hiddenBodies.has(body.id)).map(body=>({id:body.id,name:body.name,choices:edgeSelectionChoices(edgeIndexes.get(body.id),{individual:individualEdges})}));},
    view,resize,dispose(){disposed=true;cancelAnimationFrame(hoverFrame);observer.disconnect();controls.dispose();clear(solids);clear(paths);clear(edgeOverlays);if(grid)disposeObject(grid);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();hint.remove();}};
}
