import assert from 'node:assert/strict';
import fs from 'node:fs';

for(const file of ['src/security.js','src/cloud.js']){
  const source=fs.readFileSync(file,'utf8');
  assert.equal((source.match(/catch\s*\{\s*\}/g)||[]).length,0,file+' contains an empty catch');
  assert.equal((source.match(/\.catch\(\(\)=>\{\}\)/g)||[]).length,0,file+' contains a silent promise catch');
  assert.ok(source.includes('recordDiagnostic'),file+' must route recoverable failures to telemetry');
}
console.log('Hub silent error paths are routed to telemetry');
