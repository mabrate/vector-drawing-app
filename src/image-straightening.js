// Coordinates for perspective corners are normalized, clockwise from top left.
export const defaultCorners=()=>[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];

export function levelingAngle(a,b,vertical=false){
  let angle=Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI-(vertical?90:0);
  angle=((angle+90)%180+180)%180-90;
  return -angle;
}

export function rotationFrame(width,height,degrees,trim=false){
  const radians=degrees*Math.PI/180,c=Math.abs(Math.cos(radians)),s=Math.abs(Math.sin(radians));
  if(trim){
    const scale=Math.min(width/(width*c+height*s),height/(width*s+height*c));
    return {width:width*scale,height:height*scale};
  }
  return {width:width*c+height*s,height:width*s+height*c};
}

export function validCorners(points){
  if(points?.length!==4||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>1))return false;
  return points.every((p,i)=>{
    const q=points[(i+1)%4],r=points[(i+2)%4];
    return (q.x-p.x)*(r.y-q.y)-(q.y-p.y)*(r.x-q.x)>.0001;
  });
}

export function perspectiveSize(width,height,points){
  const distance=(a,b)=>Math.hypot((a.x-b.x)*width,(a.y-b.y)*height);
  return {width:Math.max(1,Math.round((distance(points[0],points[1])+distance(points[3],points[2]))/2)),height:Math.max(1,Math.round((distance(points[0],points[3])+distance(points[1],points[2]))/2))};
}

export function correctPerspective(image,points,maxSide=Infinity){
  if(!validCorners(points))throw Error('Keep the four corners in clockwise order around the page.');
  const size=perspectiveSize(image.width,image.height,points),scale=Math.min(1,maxSide/Math.max(size.width,size.height));
  const width=Math.max(1,Math.round(size.width*scale)),height=Math.max(1,Math.round(size.height*scale));
  if(width>16384||height>16384||width*height>32e6)throw Error('This image is too large to correct. Crop it or use a smaller photo.');
  const [p0,p1,p2,p3]=points;
  const dx1=p1.x-p2.x,dx2=p3.x-p2.x,dx3=p0.x-p1.x+p2.x-p3.x;
  const dy1=p1.y-p2.y,dy2=p3.y-p2.y,dy3=p0.y-p1.y+p2.y-p3.y;
  const determinant=dx1*dy2-dx2*dy1;
  let g=0,h=0;
  if(Math.abs(dx3)+Math.abs(dy3)>1e-10){
    if(Math.abs(determinant)<1e-10)throw Error('Move the corners farther apart.');
    g=(dx3*dy2-dx2*dy3)/determinant;h=(dx1*dy3-dx3*dy1)/determinant;
  }
  const a=p1.x-p0.x+g*p1.x,b=p3.x-p0.x+h*p3.x;
  const d=p1.y-p0.y+g*p1.y,e=p3.y-p0.y+h*p3.y;
  const output=new Uint8ClampedArray(width*height*4),source=image.data,indices=new Int32Array(4),weights=new Float64Array(4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const u=(x+.5)/width,v=(y+.5)/height,den=g*u+h*v+1;
    const sx=Math.max(0,Math.min(image.width-1,(a*u+b*v+p0.x)/den*image.width-.5));
    const sy=Math.max(0,Math.min(image.height-1,(d*u+e*v+p0.y)/den*image.height-.5));
    const x0=Math.floor(sx),y0=Math.floor(sy),fx=sx-x0,fy=sy-y0;
    const x1=Math.min(x0+1,image.width-1),y1=Math.min(y0+1,image.height-1);
    indices[0]=(y0*image.width+x0)*4;indices[1]=(y0*image.width+x1)*4;indices[2]=(y1*image.width+x0)*4;indices[3]=(y1*image.width+x1)*4;
    weights[0]=(1-fx)*(1-fy);weights[1]=fx*(1-fy);weights[2]=(1-fx)*fy;weights[3]=fx*fy;
    let alpha=0,red=0,green=0,blue=0;
    for(let i=0;i<4;i++){
      const index=indices[i],weight=weights[i]*source[index+3];
      alpha+=weight;red+=source[index]*weight;green+=source[index+1]*weight;blue+=source[index+2]*weight;
    }
    const index=(y*width+x)*4;
    if(alpha){output[index]=red/alpha;output[index+1]=green/alpha;output[index+2]=blue/alpha;output[index+3]=alpha;}
  }
  return {width,height,data:output};
}
