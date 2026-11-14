import * as cad from 'replicad';

// Replicad's generic traversal checks each item against every previous item.
// Faceted STL solids make that quadratic scan dominate preview generation.
// Hash buckets retain the same traversal order and IsSame semantics, including
// a real identity check for hash collisions. Callers own the returned wrappers.
export function topology(shape,kind){
  const oc=cad.getOC(),types={edge:oc.TopAbs_ShapeEnum.TopAbs_EDGE,face:oc.TopAbs_ShapeEnum.TopAbs_FACE};
  if(!(kind in types))throw Error('Unsupported topology kind.');
  const explorer=new oc.TopExp_Explorer(shape.wrapped,types[kind],oc.TopAbs_ShapeEnum.TopAbs_SHAPE),buckets=new Map(),result=[];
  try{
    while(explorer.More()){
      const raw=explorer.Current();
      try{
        const hash=oc.ReplicadShapeHasher.HashCode(raw,cad.HASH_CODE_MAX),bucket=buckets.get(hash)||[];
        if(!bucket.some(item=>item.wrapped.IsSame(raw))){
          const item=cad.cast(raw);result.push(item);bucket.push(item);buckets.set(hash,bucket);
        }
      }finally{raw.delete();}
      explorer.Next();
    }
    return result;
  }catch(error){result.forEach(item=>item.delete());throw error;}
  finally{explorer.delete();}
}
