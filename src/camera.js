export function installCamera({insert,say}){
  const input=document.createElement('input');input.id='camera-file';input.type='file';input.accept='image/*';input.setAttribute('capture','environment');input.hidden=true;document.body.append(input);
  const dialog=document.createElement('dialog');dialog.id='camera-dialog';dialog.setAttribute('aria-labelledby','camera-title');
  dialog.innerHTML=`<div class="photo-heading"><h2 id="camera-title">Take photo</h2><button id="camera-close" aria-label="Close camera">×</button></div>
    <div class="camera-preview"><video id="camera-video" autoplay muted playsinline aria-label="Live camera preview"></video><img id="camera-photo" alt="Captured photo" hidden></div>
    <label id="camera-device-label" hidden>Camera <select id="camera-device" aria-label="Camera"></select></label>
    <p id="camera-status" role="status">Starting camera…</p>
    <div class="photo-footer"><button id="camera-file-button">Choose photo…</button><button id="camera-cancel">Cancel</button><button id="camera-retake" hidden>Retake</button><button id="camera-take" class="primary" disabled>Take photo</button><button id="camera-use" class="primary" hidden>Use photo</button></div>`;
  document.body.append(dialog);
  const el=id=>dialog.querySelector(`#camera-${id}`),video=el('video'),photo=el('photo');
  let stream=null,revision=0,captured=null,photoURL=null;
  function stop(){stream?.getTracks().forEach(track=>track.stop());stream=null;video.srcObject=null;}
  function clearPhoto(){captured=null;if(photoURL)URL.revokeObjectURL(photoURL);photoURL=null;photo.removeAttribute('src');}
  function fail(error){
    stop();el('take').disabled=true;
    el('status').textContent=!window.isSecureContext?'Camera preview needs HTTPS or localhost. Choose a photo instead.':error?.name==='NotAllowedError'?'Camera permission was denied. Allow camera access in your browser, or choose a photo.':error?.name==='NotFoundError'?'No camera was found. Choose a photo instead.':'Could not start the camera. Check that it is connected and available, or choose a photo.';
  }
  async function start(deviceId){
    const request=++revision;stop();clearPhoto();photo.hidden=true;video.hidden=false;el('retake').hidden=true;el('use').hidden=true;el('take').hidden=false;el('take').disabled=true;el('status').textContent='Starting camera…';
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera unavailable');
      const next=await navigator.mediaDevices.getUserMedia({audio:false,video:{...(deviceId?{deviceId:{exact:deviceId}}:{facingMode:{ideal:'environment'}}),width:{ideal:1920},height:{ideal:1080}}});
      if(!dialog.open||request!==revision){next.getTracks().forEach(track=>track.stop());return;}
      stream=next;video.srcObject=next;await video.play();
      if(!dialog.open||request!==revision)return;
      el('take').disabled=false;el('status').textContent='Frame your photo, then choose Take photo.';
      // Device names become available after camera permission is granted.
      const devices=await navigator.mediaDevices.enumerateDevices();
      if(!dialog.open||request!==revision)return;
      const cameras=devices.filter(device=>device.kind==='videoinput');
      el('device').replaceChildren(...cameras.map((device,index)=>new Option(device.label||`Camera ${index+1}`,device.deviceId)));
      el('device').value=next.getVideoTracks()[0]?.getSettings().deviceId||deviceId||cameras[0]?.deviceId||'';
      el('device-label').hidden=cameras.length<2;
    }catch(error){if(dialog.open&&request===revision)fail(error);}
  }
  el('device').onchange=()=>start(el('device').value);
  for(const id of ['close','cancel'])el(id).onclick=()=>dialog.close();
  el('file-button').onclick=()=>{dialog.close();input.click();};
  el('retake').onclick=()=>start(el('device').value);
  el('take').onclick=async()=>{
    if(!stream||!video.videoWidth)return;
    const request=revision;el('take').disabled=true;
    try{
      const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));
      if(!dialog.open||request!==revision)return;
      if(!blob)throw Error('Could not capture photo');
      captured=blob;photoURL=URL.createObjectURL(blob);photo.src=photoURL;photo.hidden=false;video.hidden=true;stop();
      el('take').hidden=true;el('retake').hidden=false;el('use').hidden=false;el('device-label').hidden=true;el('status').textContent='Use this photo or retake it.';el('use').focus();
    }catch{if(dialog.open&&request===revision){el('status').textContent='Could not capture this photo. Try again.';el('take').disabled=false;}}
  };
  el('use').onclick=()=>{if(!captured)return;const file=new File([captured],`camera-${Date.now()}.jpg`,{type:'image/jpeg'});dialog.close();void insert([file]);};
  dialog.addEventListener('close',()=>{++revision;stop();clearPhoto();});
  input.onchange=async()=>{
    const file=input.files[0];input.value='';if(!file)return;
    let url;
    try{
      // Decode and draw once to normalize camera orientation and formats before
      // passing the photo through the ordinary embedded-image import path.
      url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();
      const scale=Math.min(1,8192/Math.max(image.naturalWidth,image.naturalHeight),Math.sqrt(32e6/(image.naturalWidth*image.naturalHeight)));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d');context.fillStyle='white';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.94));if(!blob)throw Error();
      await insert([new File([blob],`camera-${Date.now()}.jpg`,{type:'image/jpeg'})]);
    }catch{say('Could not read this camera photo. Try taking another photo or choosing a JPEG or PNG.');}
    finally{if(url)URL.revokeObjectURL(url);}
  };
  return function open(){
    const nativeCamera=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
    if(nativeCamera){input.click();return;}
    dialog.showModal();void start();
  };
}
