import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {integrationAdapterRegistry,integrationAdapterSummary,clientSafeIntegrationAdapter} from '../src/integrations.js';

const rows=integrationAdapterRegistry(),summary=integrationAdapterSummary();
assert.ok(rows.some(x=>x.id==='worldline'&&x.secretPolicy==='server_only'));
assert.ok(rows.some(x=>x.id==='uber_eats'&&x.category==='ordering'));
assert.ok(rows.some(x=>x.id==='customer_display'&&x.status==='ready'));
assert.equal(summary.total,rows.length);assert.ok(summary.prepared>0);assert.ok(summary.ready>0);
for(const row of rows){const safe=clientSafeIntegrationAdapter({...row,apiKey:'secret',token:'secret'});assert.equal('apiKey' in safe,false);assert.equal('token' in safe,false)}
const app=readFileSync('src/app.js','utf8'),pack=readFileSync('scripts/package-web.mjs','utf8');
assert.ok(app.includes('integrationAdapterRegistry()'),'Hub integration registry UI missing');
assert.ok(app.includes('integrationSecretsServerOnly'),'server-only secret policy must be visible');
assert.match(pack,/readdir\(source/,'dynamic module packaging must include integrations.js');
console.log('Integration adapter registry and client secret isolation checks passed');
