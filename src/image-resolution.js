// Smallest document-space scale of one source pixel, including shear.
// Its reciprocal gives an export scale that keeps detail in both directions.
export function sourcePixelScale({a,b,c,d}){
  const x=a*a+b*b,y=c*c+d*d,cross=a*c+b*d;
  const largest=Math.sqrt((x+y+Math.hypot(x-y,2*cross))/2);
  return largest>0?Math.abs(a*d-b*c)/largest:0;
}
