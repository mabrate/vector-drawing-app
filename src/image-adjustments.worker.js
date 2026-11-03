import {adjustImage} from './image-adjustments.js';
let preview;
self.onmessage=({data})=>{
  try{
    if(data.type==='init'){preview=data.image;return;}
    const image=adjustImage(data.type==='apply'?data.image:preview,data.settings);
    self.postMessage({type:data.type,id:data.id,image},[image.data.buffer]);
  }catch{self.postMessage({type:'error',message:'Could not adjust this image. Cancel and try again.'});}
};
