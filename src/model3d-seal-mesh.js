// Photo relief stays an indexed printable mesh. Turning every pixel triangle
// into a separate CAD face would make photographic resolution impractical.
export function prepareSealMesh(mesh){
  const {vertices,triangles}=mesh,normals=new Float32Array(vertices.length);let volume=0;
  for(let i=0;i<triangles.length;i+=3){
    const a=triangles[i]*3,b=triangles[i+1]*3,c=triangles[i+2]*3;
    const ux=vertices[b]-vertices[a],uy=vertices[b+1]-vertices[a+1],uz=vertices[b+2]-vertices[a+2];
    const vx=vertices[c]-vertices[a],vy=vertices[c+1]-vertices[a+1],vz=vertices[c+2]-vertices[a+2];
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
    volume+=(vertices[a]*nx+vertices[a+1]*ny+vertices[a+2]*nz)/6;
    for(const offset of [a,b,c]){normals[offset]+=nx;normals[offset+1]+=ny;normals[offset+2]+=nz;}
  }
  for(let i=0;i<normals.length;i+=3){const length=Math.hypot(normals[i],normals[i+1],normals[i+2])||1;normals[i]/=length;normals[i+1]/=length;normals[i+2]/=length;}
  if(!Number.isFinite(volume)||volume<=1e-7)throw Error('The photo seal does not enclose a printable volume. Increase its diameter or reduce the engraving depth.');
  return {mesh:{...mesh,normals,faceGroups:[]},volume};
}

export function sealMeshSTL(mesh){
  const {vertices,triangles}=mesh,buffer=new ArrayBuffer(84+triangles.length/3*50),view=new DataView(buffer);
  view.setUint32(80,triangles.length/3,true);
  for(let i=0;i<triangles.length;i+=3){
    const start=84+i/3*50,a=triangles[i]*3,b=triangles[i+1]*3,c=triangles[i+2]*3;
    const u=[0,1,2].map(axis=>vertices[b+axis]-vertices[a+axis]),v=[0,1,2].map(axis=>vertices[c+axis]-vertices[a+axis]);
    const normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...normal)||1;
    normal.forEach((n,axis)=>view.setFloat32(start+axis*4,n/length,true));
    for(let j=0;j<3;j++)for(let axis=0;axis<3;axis++)view.setFloat32(start+12+j*12+axis*4,vertices[triangles[i+j]*3+axis],true);
  }
  return new Uint8Array(buffer);
}

export function combineBinarySTL(parts){
  let count=0;for(const part of parts)count+=part instanceof Blob?(part.size-84)/50:new DataView(part.buffer,part.byteOffset,part.byteLength).getUint32(80,true);
  const header=new Uint8Array(84);new DataView(header.buffer).setUint32(80,count,true);
  return new Blob([header,...parts.map(part=>part instanceof Blob?part.slice(84):part.subarray(84))],{type:'model/stl'});
}
