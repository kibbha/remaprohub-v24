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
