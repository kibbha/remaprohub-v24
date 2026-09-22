const DB_NAME='remapro-pos';
const DB_VERSION=1;
let dbPromise=null;

function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('kv'))db.createObjectStore('kv');
      if(!db.objectStoreNames.contains('queue'))db.createObjectStore('queue',{keyPath:'client_event_id'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return dbPromise;
}
async function store(name,mode='readonly'){const db=await openDb();return db.transaction(name,mode).objectStore(name)}
export async function kvGet(key){const s=await store('kv');return new Promise((resolve,reject)=>{const r=s.get(key);r.onsuccess=()=>resolve(r.result??null);r.onerror=()=>reject(r.error)})}
export async function kvSet(key,value){const s=await store('kv','readwrite');return new Promise((resolve,reject)=>{const r=s.put(value,key);r.onsuccess=()=>resolve(value);r.onerror=()=>reject(r.error)})}
export async function queuePut(event){const s=await store('queue','readwrite');return new Promise((resolve,reject)=>{const r=s.put(event);r.onsuccess=()=>resolve(event);r.onerror=()=>reject(r.error)})}
export async function queueDelete(id){const s=await store('queue','readwrite');return new Promise((resolve,reject)=>{const r=s.delete(id);r.onsuccess=()=>resolve(true);r.onerror=()=>reject(r.error)})}
export async function queueAll(){const s=await store('queue');return new Promise((resolve,reject)=>{const r=s.getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error)})}
export const uuid=()=>crypto.randomUUID();
