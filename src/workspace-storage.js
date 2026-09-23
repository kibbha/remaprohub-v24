const DB_NAME='remaprohub-state-mirror';
const DB_VERSION=1;
const STORE='snapshots';
let openPromise=null;

function supported(){return typeof indexedDB!=='undefined'}
function openDb(){
  if(!supported())return Promise.resolve(null);
  if(openPromise)return openPromise;
  openPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'key'})};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return openPromise;
}
export async function writeStateMirror(key,value){
  const db=await openDb();if(!db)return false;
  const payload={key:String(key),value:JSON.parse(JSON.stringify(value)),updatedAt:new Date().toISOString()};
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite'),req=tx.objectStore(STORE).put(payload);
    req.onsuccess=()=>resolve(true);req.onerror=()=>reject(req.error);
  });
}
export async function readStateMirror(key){
  const db=await openDb();if(!db)return null;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readonly'),req=tx.objectStore(STORE).get(String(key));
    req.onsuccess=()=>resolve(req.result?.value??null);req.onerror=()=>reject(req.error);
  });
}
export async function deleteStateMirror(key){
  const db=await openDb();if(!db)return false;
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,'readwrite'),req=tx.objectStore(STORE).delete(String(key));
    req.onsuccess=()=>resolve(true);req.onerror=()=>reject(req.error);
  });
}
