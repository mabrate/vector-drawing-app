import {installImageStraightening} from './image-straightening-dialog.js';
import {rotationFrame} from './image-straightening.js';

export function installStraighteningEditor({paper,getItem,imageParts,commit,say}){
  function assertSession(session){if(!session.item.isInserted()||imageParts(session.item)?.raster!==session.raster)throw Error('Select the image again.');}
  function render(session,maxSide){
    const {raster,mask}=imageParts(session.item),b=session.bounds,m=raster.globalMatrix;
    let scale=1/Math.max(1e-8,Math.min(Math.hypot(m.a,m.b),Math.hypot(m.c,m.d)));
    if(maxSide)scale=Math.min(scale,maxSide/Math.max(b.width,b.height));
    const width=Math.max(1,Math.ceil(b.width*scale)),height=Math.max(1,Math.ceil(b.height*scale));
    if(width>16384||height>16384||width*height>32e6)throw Error('This image is too large to correct. Crop it or use a smaller photo.');
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d'),base=[scale,0,0,scale,-b.x*scale,-b.y*scale];
    context.setTransform(...base);context.transform(...mask.globalMatrix.values);context.clip(new Path2D(mask.pathData),mask.fillRule);
    context.setTransform(...base);context.transform(...m.values);context.globalAlpha=raster.opacity;context.drawImage(raster.canvas,-raster.width/2,-raster.height/2);
    return {canvas,scale};
  }
  function originalRecord(session){
    const {raster,mask}=imageParts(session.item),data=session.item.data;
    return {version:1,source:raster.toDataURL(),rasterMatrix:raster.matrix.values,opacity:raster.opacity,maskPath:mask.pathData,maskMatrix:mask.matrix.values,fillRule:mask.fillRule,crop:data.crop,cutouts:data.cutouts,intersections:data.intersections};
  }
  return installImageStraightening({
    getImage(){
      const item=getItem(),parts=imageParts(item);if(!parts)return null;
      const bounds=item.bounds.clone();if(bounds.width<=0||bounds.height<=0)throw Error('This image has no visible area to straighten.');
      const session={item,raster:parts.raster,bounds,canRestore:!!item.data.perspectiveOriginal};session.render=maxSide=>render(session,maxSide);return session;
    },
    applyLevel(session,{angle,trim}){
      assertSession(session);
      const {item,bounds}=session,center=bounds.center;
      // Prepare on a detached copy so invalid/empty intersections cannot leave
      // a partially rotated image behind when Apply fails.
      const copy=item.clone({insert:false});
      try{
        copy.rotate(angle,center);
        if(trim){
          const frame=rotationFrame(bounds.width,bounds.height,angle,true);
          const rectangle=new paper.Rectangle(center.subtract([frame.width/2,frame.height/2]),new paper.Size(frame.width,frame.height));
          const crop=new paper.Path.Rectangle({rectangle,insert:false});crop.transform(copy.matrix.inverted());
          const parts=imageParts(copy),replacement=parts.mask.intersect(crop,{insert:false});
          if(replacement.isEmpty()||Math.abs(replacement.area)<.000001){replacement.remove();crop.remove();throw Error('This trim would hide the image. Turn off Trim empty edges.');}
          const restriction=crop.clone({insert:false});restriction.transform(parts.raster.matrix.inverted());
          copy.data.intersections=[...(copy.data.intersections||[]),restriction.exportJSON({asString:true,precision:15})];restriction.remove();crop.remove();
          replacement.clipMask=true;parts.mask.replaceWith(replacement);
        }
        // Preserve the selected item's identity and embedded raster pixels.
        item.matrix=copy.matrix;const replacement=imageParts(copy).mask.clone({insert:false});replacement.clipMask=true;imageParts(item).mask.replaceWith(replacement);item.data=copy.data;
      }finally{copy.remove();}
      commit();say('Image straightened. Undo restores the previous angle and crop.');
    },
    applyPerspective(session,canvas,corners,scale){
      assertSession(session);
      const {item,bounds}=session,original=item.data.perspectiveOriginal||originalRecord(session);
      const center=new paper.Point(bounds.x+bounds.width*corners.reduce((s,p)=>s+p.x,0)/4,bounds.y+bounds.height*corners.reduce((s,p)=>s+p.y,0)/4);
      const raster=new paper.Raster({image:canvas,insert:false});
      raster.matrix=item.globalMatrix.inverted().append(new paper.Matrix(1/scale,0,0,1/scale,center.x,center.y));
      const mask=new paper.Path.Rectangle({rectangle:new paper.Rectangle(-canvas.width/2,-canvas.height/2,canvas.width,canvas.height),insert:false});mask.transform(raster.matrix);mask.clipMask=true;
      item.removeChildren();item.addChildren([mask,raster]);item.data={image:true,perspectiveOriginal:original};
      commit();say('Perspective corrected. Restore original image recovers the source; Undo restores the previous image.');
    },
    async restore(session,isActive){
      assertSession(session);
      const saved=session.item.data.perspectiveOriginal;
      const validMatrix=values=>Array.isArray(values)&&values.length===6&&values.every(Number.isFinite);
      if(saved?.version!==1||typeof saved.source!=='string'||!/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=\s]+$/i.test(saved.source)||!validMatrix(saved.rasterMatrix)||!validMatrix(saved.maskMatrix)||typeof saved.maskPath!=='string')throw Error('This image has no readable original to restore.');
      const image=new Image();image.src=saved.source;await image.decode();if(!isActive())return;assertSession(session);
      const raster=new paper.Raster({image,insert:false});raster.matrix=new paper.Matrix(saved.rasterMatrix);raster.opacity=Number.isFinite(saved.opacity)?saved.opacity:1;
      const mask=new paper.CompoundPath({pathData:saved.maskPath,insert:false});mask.transform(new paper.Matrix(saved.maskMatrix));mask.fillRule=saved.fillRule==='evenodd'?'evenodd':'nonzero';mask.clipMask=true;
      session.item.removeChildren();session.item.addChildren([mask,raster]);session.item.data={image:true,...Object.fromEntries(['crop','cutouts','intersections'].filter(key=>saved[key]!==undefined).map(key=>[key,saved[key]]))};
      commit();say('Original image restored. Undo restores the corrected image.');
    },say
  });
}
