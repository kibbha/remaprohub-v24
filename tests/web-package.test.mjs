import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const html=readFileSync('app/index.html','utf8');
const sw=readFileSync('app/sw.js','utf8');
assert.match(html,/src="src\/app\.js"/);
assert.match(html,/serviceWorker\.register\('\.\/sw\.js'\)/);
assert.doesNotMatch(html,/\.\.\/src\/app\.js/);
const assets=[...sw.matchAll(/'\.\/(?:src\/[^']+|[^']+)'/g)].map(match=>match[0].slice(3,-1));
for(const asset of assets)assert.ok(existsSync(`app/${asset}`),`offline asset missing: ${asset}`);
for(const module of ['app.js','i18n.js','store.js'])assert.equal(readFileSync(`app/src/${module}`,'utf8'),readFileSync(`src/${module}`,'utf8'));
const hash=createHash('sha256');
for(const asset of ['index.html','styles.css','icons.svg','manifest.json','assets-remaprohub-logo.png','src/app.js','src/i18n.js','src/store.js']){
  hash.update(asset);
  hash.update(readFileSync(`app/${asset}`));
}
assert.ok(sw.includes(`const CACHE='remaprohub-v27-shell-${hash.digest('hex').slice(0,12)}';`),'offline cache must match packaged assets');
console.log('PWA offline shell and packaged modules OK');
