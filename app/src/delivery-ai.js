import {cloudFunction,uploadStorageObject} from './cloud.js';

export const DELIVERY_AI_MAX_PHOTOS=8;
const uuid=()=>globalThis.crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0,v=c==='x'?r:(r&3|8);return v.toString(16)});
const nativeCamera=()=>globalThis.Capacitor?.isNativePlatform?.()?globalThis.Capacitor?.Plugins?.Camera:null;
const safeName=value=>String(value||'photo.jpg').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(-100)||'photo.jpg';

export function confidenceBand(value){const n=Number(value)||0;return n>=.9?'recognized':n>=.7?'verify':'required'}
export function confidenceLabel(value,language='fr'){
  const labels={fr:{recognized:'Reconnu',verify:'À vérifier',required:'Validation obligatoire'},en:{recognized:'Recognized',verify:'Check',required:'Validation required'},de:{recognized:'Erkannt',verify:'Prüfen',required:'Bestätigung erforderlich'},it:{recognized:'Riconosciuto',verify:'Da verificare',required:'Convalida obbligatoria'}};
  return(labels[language]||labels.fr)[confidenceBand(value)];
}
export function photoFromBlob(blob,name='photo.jpg'){
  if(!(blob instanceof Blob))throw new Error('IMAGE_REQUIRED');
  return{id:uuid(),blob,name:safeName(name),type:blob.type||'image/jpeg',size:blob.size,preview:URL.createObjectURL(blob)};
}
export function photosFromFiles(files){
  return[...(files||[])].filter(f=>String(f.type||'').startsWith('image/')).slice(0,DELIVERY_AI_MAX_PHOTOS).map(f=>photoFromBlob(f,f.name));
}
async function nativePhotoToEntry(photo,index=1){
  const url=photo?.webPath||photo?.path;if(!url)throw new Error('CAMERA_IMAGE_MISSING');
  const response=await fetch(url);if(!response.ok)throw new Error('CAMERA_IMAGE_READ_FAILED');
  const blob=await response.blob();return photoFromBlob(blob,'camera-'+Date.now()+'-'+index+'.'+(photo?.format||'jpeg'));
}
export async function takeDeliveryPhoto(){
  const camera=nativeCamera();if(!camera?.getPhoto)return null;
  const photo=await camera.getPhoto({quality:78,resultType:'uri',source:'CAMERA',direction:'REAR',correctOrientation:true,width:1800,height:1800});
  return nativePhotoToEntry(photo,1);
}
export async function pickDeliveryPhotos(){
  const camera=nativeCamera();if(!camera?.pickImages)return null;
  const result=await camera.pickImages({quality:78,limit:DELIVERY_AI_MAX_PHOTOS});
  const out=[];for(let i=0;i<(result?.photos||[]).length&&i<DELIVERY_AI_MAX_PHOTOS;i++)out.push(await nativePhotoToEntry(result.photos[i],i+1));
  return out;
}
export function disposeDeliveryPhotos(photos=[]){for(const p of photos)if(p?.preview)try{URL.revokeObjectURL(p.preview)}catch{}}
export async function analyzeDeliveryPhotos({restaurantId,analysisId,photos,language='fr',onProgress}){
  const list=(photos||[]).slice(0,DELIVERY_AI_MAX_PHOTOS);if(!restaurantId||!list.length)throw new Error('DELIVERY_PHOTOS_REQUIRED');
  const id=analysisId||uuid(),paths=[];
  for(let i=0;i<list.length;i++){
    const photo=list[i];if(photo.size>8_388_608)throw new Error('IMAGE_TOO_LARGE');
    const ext=(photo.type.split('/')[1]||'jpg').replace('jpeg','jpg').replace(/[^a-z0-9]/g,'')||'jpg';
    const path=restaurantId+'/'+id+'/'+String(i+1).padStart(2,'0')+'-'+safeName(photo.name).replace(/\.[^.]+$/,'')+'.'+ext;
    onProgress?.(Math.round(5+50*(i/list.length)),'upload',i+1,list.length);
    await uploadStorageObject('delivery-ai-temp',path,photo.blob,{attempts:4,upsert:true});paths.push(path);
  }
  onProgress?.(60,'analysis',0,list.length);
  const data=await cloudFunction('remapro-delivery-ai',{action:'analyze',restaurantId,analysisId:id,imagePaths:paths,language},{attempts:3});
  onProgress?.(100,'done',list.length,list.length);
  return{analysisId:id,paths,data};
}
export async function finalizeDeliveryAnalysis(restaurantId,analysisId,corrected){
  return cloudFunction('remapro-delivery-ai',{action:'finalize',restaurantId,analysisId,corrected},{attempts:3});
}
export async function cancelDeliveryAnalysis(restaurantId,analysisId,imagePaths=[]){
  if(!analysisId)return{ok:true};
  return cloudFunction('remapro-delivery-ai',{action:'cancel',restaurantId,analysisId,imagePaths},{attempts:2});
}
export async function loadDeliveryAnalysisHistory(restaurantId){
  return cloudFunction('remapro-delivery-ai',{action:'history',restaurantId},{attempts:2});
}
