export const colorRanges=['Reds','Yellows','Greens','Cyans','Blues','Magentas'];

export function defaultAdjustments(){
  return {mode:'color',exposure:0,contrast:0,saturation:0,threshold:128,ranges:colorRanges.map(()=>({saturation:0,brightness:0}))};
}

export function hasAdjustments(settings){
  return settings.mode!=='color'||settings.exposure!==0||settings.contrast!==0||settings.saturation!==0||settings.ranges.some(range=>range.saturation!==0||range.brightness!==0);
}

// Work from the unchanged source on every render. Alpha and pixel dimensions
// are preserved; image placement and clipping belong to the editor's raster.
export function adjustImage({data,width,height},settings){
  const output=new Uint8ClampedArray(data);
  if(!hasAdjustments(settings))return {data:output,width,height};
  const exposure=2**settings.exposure,contrast=settings.contrast<0?1+settings.contrast/100:1/(1-settings.contrast*.009);
  const tone=new Float64Array(4097);
  for(let i=0;i<tone.length;i++){
    const value=i/4096,linear=(value<=.04045?value/12.92:((value+.055)/1.055)**2.4)*exposure;
    const encoded=linear<=.0031308?12.92*linear:1.055*linear**(1/2.4)-.055;
    tone[i]=Math.max(0,Math.min(1,(encoded-.5)*contrast+.5));
  }
  const rangesActive=settings.ranges.some(range=>range.saturation||range.brightness),saturation=1+settings.saturation/100;
  for(let i=0;i<data.length;i+=4){
    if(!data[i+3])continue;
    let r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255;
    if(rangesActive){
      const max=Math.max(r,g,b),min=Math.min(r,g,b),chroma=max-min,light=(max+min)/2;
      if(chroma>0){
        const sat=chroma/(1-Math.abs(2*light-1));
        const hue=(max===r?(g-b)/chroma+(g<b?6:0):max===g?(b-r)/chroma+2:(r-g)/chroma+4);
        const index=Math.floor(hue),fraction=hue-index,blend=fraction*fraction*(3-2*fraction);
        const a=settings.ranges[index],z=settings.ranges[(index+1)%6];
        const boost=settings.mode==='color'?(a.saturation*(1-blend)+z.saturation*blend)/100:0;
        const brightness=(a.brightness*(1-blend)+z.brightness*blend)/100*sat;
        const l=Math.max(0,Math.min(1,light+brightness*(brightness>0?1-light:light)));
        const s=Math.max(0,Math.min(1,sat*(1+boost))),c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(hue%2-1)),m=l-c/2;
        if(index===0){r=c+m;g=x+m;b=m;}
        else if(index===1){r=x+m;g=c+m;b=m;}
        else if(index===2){r=m;g=c+m;b=x+m;}
        else if(index===3){r=m;g=x+m;b=c+m;}
        else if(index===4){r=x+m;g=m;b=c+m;}
        else {r=c+m;g=m;b=x+m;}
      }
    }
    r=tone[Math.round(r*4096)];g=tone[Math.round(g*4096)];b=tone[Math.round(b*4096)];
    const gray=.2126*r+.7152*g+.0722*b;
    if(settings.mode==='mono')r=g=b=gray*255<settings.threshold?0:1;
    else if(settings.mode==='gray')r=g=b=gray;
    else {r=gray+(r-gray)*saturation;g=gray+(g-gray)*saturation;b=gray+(b-gray)*saturation;}
    output[i]=Math.round(r*255);output[i+1]=Math.round(g*255);output[i+2]=Math.round(b*255);
  }
  return {data:output,width,height};
}
