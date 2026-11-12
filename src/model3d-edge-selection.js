// Build connectivity from CAD vertices and planar faces, rather than the display
// mesh: tessellation should not split a contour or bridge separate hole rims.
const TOLERANCE=1e-5;
const distance2=(a,b)=>a.reduce((sum,value,i)=>sum+(value-b[i])**2,0);
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);

export function createEdgeSelectionIndex({edgeGroups,planes=[]}){
  const candidates=new Map(),singles=new Map(),vertices=[],buckets=new Map(),planeEdges=new Map(),groups=new Map();
  function vertexId(point){
    const cell=point.map(value=>Math.floor(value/TOLERANCE));
    for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++){
      const bucket=buckets.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','));
      for(const id of bucket||[])if(distance2(vertices[id],point)<=TOLERANCE**2)return id;
    }
    const id=vertices.length,key=cell.join(',');vertices.push(point);
    if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(id);return id;
  }
  for(const edge of edgeGroups){
    if(!edge.key||singles.has(edge.key))continue;
    singles.set(edge.key,{id:`edge:${edge.key}`,keys:[edge.key],plane:null});candidates.set(edge.key,[]);
    if(!edge.endpoints?.length)continue;
    const endpoints=edge.endpoints.map(vertexId);
    for(const plane of edge.planeIds||[]){
      if(!planes[plane])continue;
      if(!planeEdges.has(plane))planeEdges.set(plane,[]);planeEdges.get(plane).push({key:edge.key,endpoints});
    }
  }
  let component=0;
  for(const [planeId,edges] of planeEdges){
    const byVertex=new Map(),remaining=new Set(edges);
    for(const edge of edges)for(const vertex of edge.endpoints){if(!byVertex.has(vertex))byVertex.set(vertex,[]);byVertex.get(vertex).push(edge);}
    for(const seed of edges){
      if(!remaining.delete(seed))continue;
      const queue=[seed],seenVertices=new Set(),keys=[];
      for(let i=0;i<queue.length;i++){
        const edge=queue[i];keys.push(edge.key);
        for(const vertex of edge.endpoints){
          if(seenVertices.has(vertex))continue;seenVertices.add(vertex);
          for(const neighbor of byVertex.get(vertex))if(remaining.delete(neighbor))queue.push(neighbor);
        }
      }
      const chain={id:`chain:${component++}`,keys,plane:planes[planeId]};
      groups.set(chain.id,chain);
      for(const key of keys)candidates.get(key).push(chain);
    }
  }
  return {candidates,singles,groups};
}

export function edgeSelectionGroup(index,key,{individual=false,normal=null}={}){
  const single=index.singles.get(key);if(!single)return null;
  if(individual)return single;
  const groups=index.candidates.get(key)||[];
  // An extrusion rim is horizontal even when its walls have draft. Prefer its
  // level plane; for side edges use the visible adjacent planar face, then the
  // largest connected component. Never hop from one plane to another mid-chain.
  let best=null,bestScore=null;
  for(const group of groups){
    const score=[Math.abs(group.plane.normal[2])>1-1e-7?1:0,normal?Math.abs(dot(group.plane.normal,normal)):0,group.keys.length];
    if(!bestScore||score.some((value,i)=>value>bestScore[i]+1e-7&&score.slice(0,i).every((prior,j)=>Math.abs(prior-bestScore[j])<=1e-7))){best=group;bestScore=score;}
  }
  return best||single;
}

export function edgeSelectionChoices(index,{individual=false}={}){
  const seen=new Set(),choices=[];
  const available=individual?[...index.singles.values()]:[...index.groups.values(),...[...index.singles.values()].filter(single=>!index.candidates.get(single.keys[0]).length)];
  for(const group of available){
    const signature=[...group.keys].sort().join('\n');
    if(seen.has(signature))continue;seen.add(signature);choices.push({key:group.keys[0],keys:group.keys,chainId:individual?null:group.id});
  }
  return choices;
}
