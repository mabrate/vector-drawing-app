export const CHAMFER_KINDS=['outside-rim','hole-rim','raised-junction','cavity-junction'];
export const chamferLabel=kind=>({'outside-rim':'Outside rim','hole-rim':'Hole rim','raised-junction':'Raised design / base junction','cavity-junction':'Inside cavity junction'}[kind]||'Individual edges or partial contour');
export function selectionContours(catalog,keys){
  const wanted=new Set(keys),contours=catalog.filter(contour=>contour.keys.every(key=>wanted.has(key))),covered=new Set(contours.flatMap(contour=>contour.keys));
  return {contours,complete:covered.size===wanted.size&&wanted.size>0};
}

export function resolveChamfer(catalog,feature,available){
  if(feature.edges.every(key=>available.has(key)))return {keys:feature.edges,rebound:false};
  if(!feature.intent)throw Error('A selected edge changed. Remove this treatment and select the edge again.');
  const chosen=[];
  for(const intent of feature.intent.contours){
    const matches=catalog.filter(contour=>contour.kind===intent.kind&&contour.side===intent.side&&contour.intent.bounds.every((n,i)=>Math.abs(n-intent.bounds[i])<.015));
    if(matches.length!==1||chosen.includes(matches[0]))throw Error('A selected edge changed and its contour is ambiguous. Edit this chamfer and select its boundary again.');
    chosen.push(matches[0]);
  }
  return {keys:chosen.flatMap(contour=>contour.keys),rebound:true};
}

export function inspectChamfer(catalog,keys,amount,edgeGroups=[],cleanupTolerance=0){
  const {contours,complete}=selectionContours(catalog,keys),wanted=new Set(keys),shortEdges=edgeGroups.filter(edge=>wanted.has(edge.key)&&edge.length<amount/2).map(edge=>edge.key);
  if(!shortEdges.length)for(const contour of contours)for(const edge of contour.edges)if(edge.length<amount/2)shortEdges.push(edge.key);
  const vertical=complete&&contours.every(contour=>contour.tilt*amount<=.002),height=complete?Math.min(...contours.map(contour=>contour.height)):null;
  const clearance=complete?Math.min(Infinity,...contours.flatMap(contour=>(contour.neighbors||[]).map(neighbor=>neighbor.clearance/(neighbor.keys.every(key=>wanted.has(key))?2:1)))):Infinity;
  return {label:complete?[...new Set(contours.map(contour=>chamferLabel(contour.kind)))].join(' + '):chamferLabel(),complete,shortEdges:[...new Set(shortEdges)],height,
    contourMethod:vertical&&contours.every(contour=>contour.side===1),
    clearance:Number.isFinite(clearance)?clearance:null,
    problem:vertical&&amount>=height-.008-cleanupTolerance?'The requested bevel exceeds the available wall height. Choose a smaller size.':
      vertical&&amount>=clearance-.008-cleanupTolerance?'The requested bevel reaches a neighboring hole, wall, or base edge. Choose a smaller size.':
      vertical&&contours.some(contour=>['outside-rim','cavity-junction'].includes(contour.kind)&&amount*2>=contour.span-.008-cleanupTolerance)?'The requested bevel reaches across a narrow region. Choose a smaller size.':null};
}

export function smallerChamferSizes(amount){return [...new Set([.75,.5,.25].map(fraction=>Math.floor(amount*fraction*1e6)/1e6))].filter(n=>n>=.0001&&n<amount);}
