import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

export function createModelViewer(container,onSelection){
  const scene=new THREE.Scene();scene.background=new THREE.Color('#edf2ef');
  const camera=new THREE.PerspectiveCamera(40,1,.01,100000);camera.up.set(0,0,1);
  const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.domElement.setAttribute('aria-label','3D model. Drag to orbit; use two fingers or the right mouse button to pan and zoom. Click an edge to select it.');
  renderer.domElement.setAttribute('role','img');renderer.domElement.tabIndex=0;container.append(renderer.domElement);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;
  const group=new THREE.Group();scene.add(group);
  scene.add(new THREE.HemisphereLight(0xffffff,0x6b7c79,2.8));
  const light=new THREE.DirectionalLight(0xffffff,2.6);light.position.set(-100,-150,250);scene.add(light);
  let grid=null,meshes=[],selection=[],span=100,disposed=false;
  const colors=['#398b87','#c78248','#7477ab','#7b9e4c','#bd6a7e'];
  function render(){if(!disposed)renderer.render(scene,camera);}
  function disposeObject(object){object.traverse(child=>{child.geometry?.dispose();if(child.material)for(const material of [].concat(child.material))material.dispose();});}
  function setSelection(next,notify=true){
    selection=next.filter(item=>meshes.some(mesh=>mesh.id===item.body&&mesh.edges.edgeGroups.some(edge=>edge.key===item.key)));
    for(const child of group.children){if(!child.userData.edge)continue;const chosen=selection.some(item=>item.body===child.userData.body&&item.key===child.userData.edge);child.material.color.set(chosen?'#e33f79':'#203c43');child.material.opacity=chosen?1:.68;child.renderOrder=chosen?3:1;}
    render();if(notify)onSelection(selection);
  }
  function resize(){const {width,height}=container.getBoundingClientRect();if(width<1||height<1)return;renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();render();}
  const observer=new ResizeObserver(resize);observer.observe(container);
  function view(name='iso'){
    const bounds=new THREE.Box3().setFromObject(group),center=bounds.isEmpty()?new THREE.Vector3():bounds.getCenter(new THREE.Vector3());
    span=bounds.isEmpty()?100:Math.max(...bounds.getSize(new THREE.Vector3()).toArray(),1);
    const direction={iso:[1,-1,1],top:[0,0,1],front:[0,-1,0],right:[1,0,0]}[name]||[1,-1,1];
    const distance=span/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2)))*1.5/Math.min(camera.aspect,1);
    controls.target.copy(center);camera.position.copy(center).add(new THREE.Vector3(...direction).normalize().multiplyScalar(distance));
    camera.near=Math.max(.001,distance/10000);camera.far=Math.max(1000,distance*100);camera.updateProjectionMatrix();controls.update();render();
  }
  function setMeshes(next,fit=false){
    meshes=next;for(const child of [...group.children]){disposeObject(child);group.remove(child);}
    next.forEach((body,index)=>{
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(body.mesh.vertices,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(body.mesh.normals,3));geometry.setIndex(body.mesh.triangles);
      const material=new THREE.MeshStandardMaterial({color:colors[index%colors.length],roughness:.55,metalness:.05,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
      group.add(new THREE.Mesh(geometry,material));
      for(const edge of body.edges.edgeGroups){
        if(!edge.key)continue;
        const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(body.edges.lines.slice(edge.start*3,(edge.start+edge.count)*3),3));
        const line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:'#203c43',transparent:true,opacity:.68}));line.userData={body:body.id,edge:edge.key};group.add(line);
      }
    });
    if(grid){scene.remove(grid);disposeObject(grid);}
    const bounds=new THREE.Box3().setFromObject(group),center=bounds.isEmpty()?new THREE.Vector3():bounds.getCenter(new THREE.Vector3());
    const extent=bounds.isEmpty()?100:Math.max(...bounds.getSize(new THREE.Vector3()).toArray(),10);
    grid=new THREE.GridHelper(extent*2,20,0xb8c7c0,0xd3dfd8);grid.rotation.x=Math.PI/2;grid.position.set(center.x,center.y,bounds.isEmpty()?-.01:Math.min(0,bounds.min.z)-.01);scene.add(grid);
    setSelection(selection);if(fit)view();else render();
  }
  controls.addEventListener('change',render);
  let down;const pointers=new Set();
  renderer.domElement.addEventListener('pointerdown',event=>{pointers.add(event.pointerId);down=pointers.size===1?{x:event.clientX,y:event.clientY,id:event.pointerId}:null;});
  renderer.domElement.addEventListener('pointerup',event=>{
    pointers.delete(event.pointerId);
    if(!down||down.id!==event.pointerId||Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)return;
    down=null;const rect=renderer.domElement.getBoundingClientRect(),ray=new THREE.Raycaster();
    ray.params.Line.threshold=camera.position.distanceTo(controls.target)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*10/rect.height;
    ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
    const hits=ray.intersectObjects(group.children),surface=hits.find(hit=>hit.object.isMesh);
    const hit=hits.find(hit=>hit.object.userData.edge&&(!surface||hit.distance<=surface.distance+ray.params.Line.threshold*2));
    if(!hit){setSelection([]);return;}
    const item={body:hit.object.userData.body,key:hit.object.userData.edge};
    const next=selection.filter(entry=>entry.body===item.body),exists=next.some(entry=>entry.key===item.key);
    setSelection(exists?next.filter(entry=>entry.key!==item.key):[...next,item]);
  });
  renderer.domElement.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);down=null;});
  resize();view();
  return {setMeshes,setSelection,view,resize,dispose(){disposed=true;observer.disconnect();controls.dispose();disposeObject(group);if(grid)disposeObject(grid);renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();}};
}
