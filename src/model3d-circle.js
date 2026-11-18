// Paper/SVG circles are four cubic quarter arcs. Recognize that construction,
// including rotated/reversed paths, rather than fitting arbitrary curved art.
// DraftAngle cannot taper their spline extrusion surfaces; circular lofts give
// OpenCascade actual conical walls while the editable recipe stays untouched.
export function circularLoop(curves){
  if(curves.length!==4)return null;
  const center=[0,1].map(axis=>curves.reduce((sum,curve)=>sum+curve[0][axis],0)/4);
  const radial=curves.map(curve=>curve[0].map((value,axis)=>value-center[axis]));
  const radius=Math.hypot(...radial[0]),tolerance=Math.max(1e-7,radius*1e-7),kappa=4*(Math.sqrt(2)-1)/3;
  if(radius<=tolerance)return null;
  const sign=Math.sign(radial[0][0]*radial[1][1]-radial[0][1]*radial[1][0]);
  const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<=tolerance;
  for(let i=0;i<4;i++){
    const [start,c1,c2,end]=curves[i],a=radial[i],b=radial[(i+1)%4];
    if(!near(b,[-sign*a[1],sign*a[0]])||!near(end,curves[(i+1)%4][0])||
      !near(c1,[start[0]-sign*kappa*a[1],start[1]+sign*kappa*a[0]])||
      !near(c2,[end[0]+sign*kappa*b[1],end[1]-sign*kappa*b[0]]))return null;
  }
  return {center,radius};
}
