import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
assert.equal(JSON.parse(read('package.json')).version,'0.7.0');
assert.equal(JSON.parse(read('capacitor.config.json')).appId,'com.remapro.pos');
const app=read('src/app.js');
for(const token of ['append_order_items','deltaLines','hasPendingDelta','Envoyer les ajouts','delta-badge','paymentBlockedByDelta'])assert.ok(app.includes(token),token);
assert.doesNotMatch(read('src/cloud.js'),/service[_-]?role/i);
console.log('ReMaPro POS 0.7 smoke checks passed');
