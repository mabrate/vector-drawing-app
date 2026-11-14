export const MAX_STL_TRIANGLES=10000;
export const MAX_STL_BYTES=8*1024*1024;
export const MAX_MODEL_TRIANGLES=20000;
const number=value=>Number.isFinite(value)&&Math.abs(value)<=100000;
export function validSTLMesh(mesh){
  return !!mesh&&Array.isArray(mesh.vertices)&&mesh.vertices.length>=12&&mesh.vertices.length%3===0&&mesh.vertices.length<=MAX_STL_TRIANGLES*9&&mesh.vertices.every(number)&&
    Array.isArray(mesh.triangles)&&mesh.triangles.length>=12&&mesh.triangles.length%3===0&&mesh.triangles.length<=MAX_STL_TRIANGLES*3&&mesh.triangles.every(index=>Number.isInteger(index)&&index>=0&&index<mesh.vertices.length/3);
}

// Weld coordinates and repair triangle winding, not the student's source file.
// Every edge must have exactly two neighboring triangles before CAD conversion.
export function meshComponents(mesh){
  if(!validSTLMesh(mesh))throw Error('The STL mesh is invalid or exceeds 10,000 triangles.');
  const {vertices,triangles}=mesh,edges=new Map(),adjacent=Array.from({length:triangles.length/3},()=>[]),seen=new Set();
  for(let face=0;face<adjacent.length;face++){
    const points=triangles.slice(face*3,face*3+3),key=[...points].sort((a,b)=>a-b).join(',');
    if(new Set(points).size!==3||seen.has(key))throw Error('The STL contains duplicate or degenerate triangles. Repair the mesh and try again.');seen.add(key);
    for(let i=0;i<3;i++){
      const a=points[i],b=points[(i+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;
      if(!edges.has(key))edges.set(key,[]);edges.get(key).push({face,forward:a<b});
    }
  }
  for(const pair of edges.values()){
    if(pair.length!==2)throw Error('The STL must be closed and manifold. Repair holes or edges shared by more than two triangles before importing.');
    const [a,b]=pair;adjacent[a.face].push({face:b.face,same:a.forward===b.forward});adjacent[b.face].push({face:a.face,same:a.forward===b.forward});
  }
  const flips=new Map(),components=[];
  for(let seed=0;seed<adjacent.length;seed++){
    if(flips.has(seed))continue;
    const faces=[seed];flips.set(seed,false);
    for(let index=0;index<faces.length;index++)for(const neighbor of adjacent[faces[index]]){
      const flip=flips.get(faces[index])!==neighbor.same;
      if(flips.has(neighbor.face)){if(flips.get(neighbor.face)!==flip)throw Error('The STL surface cannot be oriented into a solid. Repair the mesh first.');}
      else{flips.set(neighbor.face,flip);faces.push(neighbor.face);}
    }
    if(components.length>=32)throw Error('This STL has more than 32 disconnected shells. Import fewer parts at a time.');
    const component=faces.map(face=>{const triangle=triangles.slice(face*3,face*3+3);return flips.get(face)?triangle.reverse():triangle;});
    const origin=vertices.slice(component[0][0]*3,component[0][0]*3+3);let volume=0;
    for(const indices of component){const [a,b,c]=indices.map(index=>vertices.slice(index*3,index*3+3).map((n,i)=>n-origin[i]));volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;}
    if(Math.abs(volume)<=1e-8)throw Error('The STL does not enclose a measurable volume.');
    components.push(volume<0?component.map(triangle=>triangle.reverse()):component);
  }
  return components;
}

export function readSTL(buffer){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength>MAX_STL_BYTES||buffer.byteLength<15)throw Error('Choose an STL file smaller than 8 MB.');
  const values=[];
  const view=new DataView(buffer),count=buffer.byteLength>=84?view.getUint32(80,true):0;
  if(buffer.byteLength>=84&&84+count*50===buffer.byteLength){
    if(count>MAX_STL_TRIANGLES)throw Error('This STL exceeds 10,000 triangles. Simplify it before importing.');
    for(let face=0;face<count;face++)for(let coordinate=0;coordinate<9;coordinate++)values.push(view.getFloat32(84+face*50+12+coordinate*4,true));
  }else{
    const text=new TextDecoder().decode(buffer);if(!/^\s*solid(?:\s|$)/i.test(text))throw Error('This is not a supported binary or ASCII STL.');
    const scalar='([-+]?(?:\\d*\\.\\d+|\\d+\\.?\\d*)(?:[eE][-+]?\\d+)?)';
    let facet=null,facets=0;
    for(const match of text.matchAll(new RegExp(`\\bfacet\\s+normal\\b|\\bendfacet\\b|\\bvertex\\s+${scalar}\\s+${scalar}\\s+${scalar}(?=\\s|$)`,'gi'))){
      if(/^facet/i.test(match[0])){if(facet)throw Error('An STL facet is incomplete.');facet=[];}
      else if(/^endfacet/i.test(match[0])){
        if(!facet||facet.length!==9)throw Error('An STL facet does not contain exactly three vertices.');
        if(++facets>MAX_STL_TRIANGLES)throw Error('This STL exceeds 10,000 triangles. Simplify it before importing.');values.push(...facet);facet=null;
      }else{if(!facet||facet.length>=9)throw Error('An STL facet has invalid vertices.');facet.push(...match.slice(1).map(Number));}
    }
    if(facet||facets<4)throw Error('Use a complete closed STL with at least four triangles.');
  }
  if(!values.every(number))throw Error('The STL has invalid coordinates or dimensions larger than 100,000 units.');
  const vertices=[],triangles=[],points=new Map(),facets=new Set();
  for(let offset=0;offset<values.length;offset+=9){
    const triangle=[];
    for(let i=0;i<3;i++){
      const point=values.slice(offset+i*3,offset+i*3+3).map(n=>Number(n.toFixed(6))),key=point.join(',');
      if(!points.has(key)){points.set(key,vertices.length/3);vertices.push(...point);}triangle.push(points.get(key));
    }
    if(new Set(triangle).size!==3)continue;
    const key=[...triangle].sort((a,b)=>a-b).join(',');if(facets.has(key))continue;facets.add(key);triangles.push(...triangle);
  }
  const used=new Map(),compact=[];
  const indices=triangles.map(index=>{if(!used.has(index)){used.set(index,compact.length/3);compact.push(...vertices.slice(index*3,index*3+3));}return used.get(index);});
  const mesh={vertices:compact,triangles:indices};meshComponents(mesh);return mesh;
}
