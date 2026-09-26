import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readPublishedBundle,readConfigurationSnapshot,applyPublishedBundle,publishedDeviceProfiles ,readCachedConfigurationSnapshot} from '../src/configuration-bundle.js';

const document={schemaVersion:1,catalog:[{id:'a',name:'Plat'}],layout:{version:2},tables:[{id:'t',label:'1'}],floorPlan:null};
const payload=JSON.stringify(document),checksum=createHash('sha256').update(payload).digest('hex');
const result={bundle:{version:3,schema_version:1,source_revision:12,payload,checksum}};
const bundle=await readPublishedBundle(result,{revision:13});
assert.equal(bundle.version,3);
assert.deepEqual(applyPublishedBundle({restaurant:{id:'r'},catalog:[]},bundle).catalog,document.catalog);
assert.equal(await readPublishedBundle(result,{revision:14}),null,'a direct update supersedes the published snapshot');
assert.equal(await readPublishedBundle({bundle:null},{revision:13}),null,'legacy backend remains usable');
await assert.rejects(readPublishedBundle({bundle:{...result.bundle,payload:payload+' '}},{revision:13}),/BUNDLE_CHECKSUM_INVALID/);
const configured={document:{printers:[{id:'p',label:'Cuisine',role:'kitchen',address:'10.0.0.2',active:true}],terminals:[{id:'t',label:'Carte',supports_card:true,active:true}]}};
assert.deepEqual(publishedDeviceProfiles([{id:'p',label:'Ancien',status:'offline',last_tested_at:'now'}],configured,'printers'),
  [{id:'p',label:'Cuisine',role:'kitchen',address:'10.0.0.2',active:true,status:'offline',last_tested_at:'now'}]);
assert.deepEqual(publishedDeviceProfiles([{id:'t',label:'Ancien',connection_status:'online'}],configured,'terminals'),
  [{id:'t',label:'Carte',supports_card:true,active:true,connection_status:'online'}]);
assert.deepEqual(publishedDeviceProfiles([{id:'p',status:'online'}],{document:{}},'printers'),[{id:'p',status:'online'}]);
console.log('configuration-bundle.test.mjs: OK');

const atomic=await readConfigurationSnapshot({snapshot:{version:4,schema_version:1,source_revision:13,payload,checksum,settings:{payments:{cash:true}}}});
assert.equal(atomic.version,4);
assert.equal(atomic.sourceRevision,13);
assert.deepEqual(atomic.document.catalog,document.catalog);
assert.equal(atomic.settings.payments.cash,true);
await assert.rejects(readConfigurationSnapshot({snapshot:{version:4,schema_version:1,source_revision:13,payload:payload+'x',checksum}}),/BUNDLE_CHECKSUM_INVALID/);

const cachedPayload=JSON.stringify({schemaVersion:1,catalog:[],tables:[],layout:{}});
const cachedBytes=new TextEncoder().encode(cachedPayload);const cachedHash=await crypto.subtle.digest('SHA-256',cachedBytes);const cachedChecksum=Array.from(new Uint8Array(cachedHash),x=>x.toString(16).padStart(2,'0')).join('');
const cached=await readCachedConfigurationSnapshot({bundle:{version:3,sourceRevision:7,payload:cachedPayload,checksum:cachedChecksum},settings:{payments:{cash:true}}});
assert.equal(cached.version,3);assert.equal(cached.document.schemaVersion,1);
assert.equal(await readCachedConfigurationSnapshot({bundle:{version:3,sourceRevision:7,payload:cachedPayload,checksum:'0'.repeat(64)}}),null);
