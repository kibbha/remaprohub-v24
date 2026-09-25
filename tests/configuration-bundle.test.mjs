import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readPublishedBundle,applyPublishedBundle} from '../src/configuration-bundle.js';

const document={schemaVersion:1,catalog:[{id:'a',name:'Plat'}],layout:{version:2},tables:[{id:'t',label:'1'}],floorPlan:null};
const payload=JSON.stringify(document),checksum=createHash('sha256').update(payload).digest('hex');
const result={bundle:{version:3,schema_version:1,source_revision:12,payload,checksum}};
const bundle=await readPublishedBundle(result,{revision:13});
assert.equal(bundle.version,3);
assert.deepEqual(applyPublishedBundle({restaurant:{id:'r'},catalog:[]},bundle).catalog,document.catalog);
assert.equal(await readPublishedBundle(result,{revision:14}),null,'a direct update supersedes the published snapshot');
assert.equal(await readPublishedBundle({bundle:null},{revision:13}),null,'legacy backend remains usable');
await assert.rejects(readPublishedBundle({bundle:{...result.bundle,payload:payload+' '}},{revision:13}),/BUNDLE_CHECKSUM_INVALID/);
console.log('configuration-bundle.test.mjs: OK');
