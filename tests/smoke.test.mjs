import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
assert.equal(JSON.parse(read('package.json')).version,'0.6.0');
assert.equal(JSON.parse(read('capacitor.config.json')).appId,'com.remapro.pos');
const app=read('src/app.js');
for(const token of ['production_queue','send_to_production','update_production_item','nav-production','data-production-item','orderLocked'])assert.ok(app.includes(token),token);
assert.doesNotMatch(read('src/cloud.js'),/service[_-]?role/i);
console.log('ReMaPro POS 0.6 smoke checks passed');
