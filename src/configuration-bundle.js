export async function readPublishedBundle(result, head) {
  const bundle=result?.bundle;
  if(!bundle)return null;
  const source=Number(bundle.source_revision),revision=Number(head?.revision);
  if(Number(bundle.schema_version)!==1||!Number.isSafeInteger(source)||revision!==source+1)return null;
  const payload=String(bundle.payload||''),checksum=String(bundle.checksum||'').toLowerCase();
  if(!payload||!(/^[0-9a-f]{64}$/.test(checksum)))throw new Error('BUNDLE_CHECKSUM_INVALID');
  const bytes=new TextEncoder().encode(payload),hash=await crypto.subtle.digest('SHA-256',bytes);
  const actual=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
  if(actual!==checksum)throw new Error('BUNDLE_CHECKSUM_INVALID');
  const document=JSON.parse(payload);
  if(document?.schemaVersion!==1||!Array.isArray(document.catalog)||!Array.isArray(document.tables))throw new Error('BUNDLE_SCHEMA_INVALID');
  return{version:Number(bundle.version),document};
}

export function applyPublishedBundle(bootstrap,bundle) {
  if(!bundle)return bootstrap;
  return{...bootstrap,catalog:bundle.document.catalog,layout:bundle.document.layout,configurationBundleVersion:bundle.version};
}

export function publishedDeviceProfiles(live,bundle,kind) {
  const published=bundle?.document?.[kind];
  if(!Array.isArray(published))return live;
  const dynamic=kind==='printers'?['status','last_tested_at','created_at','updated_at']:['connection_status','last_seen_at','created_at','updated_at'];
  const liveById=new Map((live||[]).map(row=>[String(row.id),row]));
  return published.map(profile=>{
    const current=liveById.get(String(profile.id))||{};
    const status=Object.fromEntries(dynamic.filter(key=>Object.hasOwn(current,key)).map(key=>[key,current[key]]));
    return{...profile,...status};
  });
}

export async function readConfigurationSnapshot(result) {
  const snapshot=result?.snapshot;
  if(!snapshot)return null;
  const payload=String(snapshot.payload||''),checksum=String(snapshot.checksum||'').toLowerCase();
  if(Number(snapshot.schema_version)!==1||!payload||!(/^[0-9a-f]{64}$/.test(checksum)))throw new Error('BUNDLE_CHECKSUM_INVALID');
  const bytes=new TextEncoder().encode(payload),hash=await crypto.subtle.digest('SHA-256',bytes);
  const actual=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
  if(actual!==checksum)throw new Error('BUNDLE_CHECKSUM_INVALID');
  const document=JSON.parse(payload);
  if(document?.schemaVersion!==1||!Array.isArray(document.catalog)||!Array.isArray(document.tables))throw new Error('BUNDLE_SCHEMA_INVALID');
  return{version:Number(snapshot.version),sourceRevision:Number(snapshot.source_revision),publishedAt:snapshot.published_at||snapshot.headPublishedAt||'',settings:snapshot.settings||document.settings||null,document};
}
