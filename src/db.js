const DB_NAME='remapro-pos';
const DB_VERSION=1;
const SQLITE_DB='remapro_pos_local';
let idbPromise=null;
let sqlitePromise=null;
let sqliteUnavailable=false;
let backend='indexeddb';

const nativePlatform=()=>Boolean(globalThis.Capacitor?.isNativePlatform?.());

function openIdb(){
  if(idbPromise)return idbPromise;
  idbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains('kv'))db.createObjectStore('kv');
      if(!db.objectStoreNames.contains('queue'))db.createObjectStore('queue',{keyPath:'client_event_id'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
  return idbPromise;
}
async function idbStore(name,mode='readonly'){
  const db=await openIdb();
  return db.transaction(name,mode).objectStore(name);
}
async function idbGet(key){
  const s=await idbStore('kv');
  return new Promise((resolve,reject)=>{const r=s.get(key);r.onsuccess=()=>resolve(r.result??null);r.onerror=()=>reject(r.error)});
}
async function idbSet(key,value){
  const s=await idbStore('kv','readwrite');
  return new Promise((resolve,reject)=>{const r=s.put(value,key);r.onsuccess=()=>resolve(value);r.onerror=()=>reject(r.error)});
}
async function idbDelete(key){
  const s=await idbStore('kv','readwrite');
  return new Promise((resolve,reject)=>{const r=s.delete(key);r.onsuccess=()=>resolve(true);r.onerror=()=>reject(r.error)});
}
async function idbQueuePut(event){
  const s=await idbStore('queue','readwrite');
  return new Promise((resolve,reject)=>{const r=s.put(event);r.onsuccess=()=>resolve(event);r.onerror=()=>reject(r.error)});
}
async function idbQueueDelete(id){
  const s=await idbStore('queue','readwrite');
  return new Promise((resolve,reject)=>{const r=s.delete(id);r.onsuccess=()=>resolve(true);r.onerror=()=>reject(r.error)});
}
async function idbQueueAll(){
  const s=await idbStore('queue');
  return new Promise((resolve,reject)=>{
    const r=s.getAll();
    r.onsuccess=()=>resolve((r.result||[]).sort((a,b)=>String(a.queued_at||'').localeCompare(String(b.queued_at||''))));
    r.onerror=()=>reject(r.error);
  });
}
async function idbAllKv(){
  const s=await idbStore('kv');
  return new Promise((resolve,reject)=>{
    const kr=s.getAllKeys(),vr=s.getAll();let keys=null,values=null;
    const done=()=>{if(keys&&values)resolve(keys.map((key,i)=>[String(key),values[i]]))};
    kr.onsuccess=()=>{keys=kr.result||[];done()};kr.onerror=()=>reject(kr.error);
    vr.onsuccess=()=>{values=vr.result||[];done()};vr.onerror=()=>reject(vr.error);
  });
}

async function initSqlite(){
  if(!nativePlatform()||sqliteUnavailable)return null;
  if(sqlitePromise)return sqlitePromise;
  sqlitePromise=(async()=>{
    try{
      const mod=await import('@capacitor-community/sqlite');
      const sqlite=new mod.SQLiteConnection(mod.CapacitorSQLite);
      let db;
      try{
        const consistent=await sqlite.checkConnectionsConsistency();
        const isConn=(await sqlite.isConnection(SQLITE_DB,false)).result;
        if(consistent.result&&isConn)db=await sqlite.retrieveConnection(SQLITE_DB,false);
        else db=await sqlite.createConnection(SQLITE_DB,false,'no-encryption',1,false);
      }catch{
        db=await sqlite.createConnection(SQLITE_DB,false,'no-encryption',1,false);
      }
      await db.open();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS kv (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS queue (
          client_event_id TEXT PRIMARY KEY NOT NULL,
          queued_at TEXT NOT NULL,
          payload TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS queue_queued_at_idx ON queue(queued_at);
      `);
      const marker=await db.query('SELECT value FROM kv WHERE key=? LIMIT 1',['__sqlite_migrated_v1']);
      if(!(marker.values||[]).length){
        try{
          const kvRows=await idbAllKv();
          for(const [key,value] of kvRows){
            await db.run(
              'INSERT OR REPLACE INTO kv(key,value,updated_at) VALUES(?,?,?)',
              [key,JSON.stringify(value),new Date().toISOString()]
            );
          }
          const queued=await idbQueueAll();
          for(const event of queued){
            await db.run(
              'INSERT OR REPLACE INTO queue(client_event_id,queued_at,payload) VALUES(?,?,?)',
              [event.client_event_id,event.queued_at||new Date().toISOString(),JSON.stringify(event)]
            );
          }
        }catch{}
        await db.run(
          'INSERT OR REPLACE INTO kv(key,value,updated_at) VALUES(?,?,?)',
          ['__sqlite_migrated_v1',JSON.stringify(true),new Date().toISOString()]
        );
      }
      backend='sqlite';
      return db;
    }catch(error){
      console.warn('SQLite unavailable, IndexedDB fallback active',error);
      sqliteUnavailable=true;backend='indexeddb';return null;
    }
  })();
  return sqlitePromise;
}

async function sqliteDb(){return initSqlite()}

export async function kvGet(key){
  const db=await sqliteDb();
  if(!db)return idbGet(key);
  const r=await db.query('SELECT value FROM kv WHERE key=? LIMIT 1',[String(key)]);
  const row=(r.values||[])[0];if(!row)return null;
  try{return JSON.parse(row.value)}catch{return null}
}
export async function kvSet(key,value){
  const db=await sqliteDb();
  if(!db)return idbSet(key,value);
  await db.run(
    'INSERT INTO kv(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at',
    [String(key),JSON.stringify(value),new Date().toISOString()]
  );
  return value;
}
export async function kvDelete(key){
  const db=await sqliteDb();
  if(!db)return idbDelete(key);
  await db.run('DELETE FROM kv WHERE key=?',[String(key)]);
  return true;
}
export async function queuePut(event){
  const db=await sqliteDb();
  if(!db)return idbQueuePut(event);
  await db.run(
    'INSERT INTO queue(client_event_id,queued_at,payload) VALUES(?,?,?) ON CONFLICT(client_event_id) DO UPDATE SET queued_at=excluded.queued_at,payload=excluded.payload',
    [String(event.client_event_id),String(event.queued_at||new Date().toISOString()),JSON.stringify(event)]
  );
  return event;
}
export async function queueDelete(id){
  const db=await sqliteDb();
  if(!db)return idbQueueDelete(id);
  await db.run('DELETE FROM queue WHERE client_event_id=?',[String(id)]);
  return true;
}
export async function queueAll(){
  const db=await sqliteDb();
  if(!db)return idbQueueAll();
  const r=await db.query('SELECT payload FROM queue ORDER BY queued_at ASC');
  return (r.values||[]).map(row=>{try{return JSON.parse(row.payload)}catch{return null}}).filter(Boolean);
}
export async function storageBackend(){
  await initSqlite();
  return backend;
}
export const uuid=()=>crypto.randomUUID();
