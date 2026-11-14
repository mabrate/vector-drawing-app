export const boxMesh=(width=20,height=20,depth=10,offset=[0,0,0])=>({
  vertices:[[0,0,0],[width,0,0],[width,height,0],[0,height,0],[0,0,depth],[width,0,depth],[width,height,depth],[0,height,depth]].flatMap(point=>point.map((n,i)=>n+offset[i])),
  triangles:[0,3,2,0,2,1,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]
});
export function binarySTL(mesh=boxMesh(),header='Vector Lab STL fixture'){
  const buffer=Buffer.alloc(84+mesh.triangles.length/3*50);buffer.write(header,0,Math.min(80,header.length));buffer.writeUInt32LE(mesh.triangles.length/3,80);
  for(let triangle=0;triangle<mesh.triangles.length/3;triangle++)for(let point=0;point<3;point++)for(let axis=0;axis<3;axis++)buffer.writeFloatLE(mesh.vertices[mesh.triangles[triangle*3+point]*3+axis],84+triangle*50+12+(point*3+axis)*4);
  return buffer;
}
export function asciiSTL(mesh=boxMesh()){
  const records=[];for(let i=0;i<mesh.triangles.length;i+=3)records.push(`facet normal 0 0 0\nouter loop\n${mesh.triangles.slice(i,i+3).map(index=>'vertex '+mesh.vertices.slice(index*3,index*3+3).join(' ')).join('\n')}\nendloop\nendfacet`);
  return Buffer.from(`solid fixture\n${records.join('\n')}\nendsolid fixture`);
}
export const arrayBuffer=buffer=>buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength);
export function combineMeshes(meshes){
  const vertices=[],triangles=[];for(const mesh of meshes){const offset=vertices.length/3;vertices.push(...mesh.vertices);triangles.push(...mesh.triangles.map(index=>index+offset));}return {vertices,triangles};
}
// Check printable exports without the CAD importer's intentional facet limit.
export function closedBinarySTL(buffer){
  if(buffer.length<84)return false;const count=buffer.readUInt32LE(80);if(buffer.length!==84+count*50||count<4)return false;
  const edges=new Map();
  for(let triangle=0;triangle<count;triangle++){
    const points=[];for(let point=0;point<3;point++){const values=[];for(let axis=0;axis<3;axis++)values.push(Number(buffer.readFloatLE(84+triangle*50+12+(point*3+axis)*4).toFixed(6)));points.push(values.join(','));}
    if(new Set(points).size<3)continue;
    for(let index=0;index<3;index++){const a=points[index],b=points[(index+1)%3],key=a<b?`${a}|${b}`:`${b}|${a}`;const record=edges.get(key)||{count:0,winding:0};record.count++;record.winding+=a<b?1:-1;edges.set(key,record);}
  }
  return [...edges.values()].every(edge=>edge.count===2&&edge.winding===0);
}
