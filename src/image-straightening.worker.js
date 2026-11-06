import {correctPerspective} from './image-straightening.js';
self.onmessage=({data})=>{
  try{
    const image=correctPerspective(data.image,data.corners);
    self.postMessage({image},[image.data.buffer]);
  }catch(error){self.postMessage({error:error.message||'Could not correct this photo.'});}
};
