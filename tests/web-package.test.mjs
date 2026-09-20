import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const html=readFileSync('app/index.html','utf8');
const sw=readFileSync('app/sw.js','utf8');
const manifest=JSON.parse(readFileSync('app/manifest.json','utf8'));
const installIcon=readFileSync('app/icon.svg','utf8');
assert.match(html,/src="src\/app\.js"/);
assert.match(html,/src="bootstrap\.js"/);\nassert.match(readFileSync('app/bootstrap.js','utf8'),/serviceWorker\.register\('\.\/sw\.js'\)/);
assert.equal(manifest.icons?.[0]?.src,'icon.svg');
assert.equal(manifest.icons?.[0]?.sizes,'192x192');\nassert.equal(manifest.icons?.[1]?.sizes,'512x512');
assert.match(manifest.icons?.[2]?.purpose||'',/maskable/);\nassert.equal(manifest.display,'standalone');
assert.match(installIcon,/viewBox="0 0 1024 1024"/);
assert.match(installIcon,/data:image\/png;base64,/);
assert.match(sw,/'\.\/icon\.svg'/);
assert.doesNotMatch(html,/\.\.\/src\/app\.js/);
const assets=[...sw.matchAll(/'\.\/(?:src\/[^']+|[^']+)'/g)].map(match=>match[0].slice(3,-1));
for(const asset of assets)assert.ok(existsSync(`app/${asset}`),`offline asset missing: ${asset}`);
for(const module of ['app.js','restored.js','i18n.js','store.js','ai.js','cloud.js','legal.js','billing.js'])assert.equal(readFileSync(`app/src/${module}`,'utf8'),readFileSync(`src/${module}`,'utf8'));
const hash=createHash('sha256');
for(const asset of ['index.html','bootstrap.js','runtime-config.js','privacy-policy.html','account-deletion.html','styles.css','icons.svg','manifest.json','icon.svg','assets-remaprohub-logo.png','src/app.js','src/restored.js','src/i18n.js','src/store.js','src/ai.js','src/cloud.js','src/legal.js','src/billing.js']){
  hash.update(asset);
  hash.update(readFileSync(`app/${asset}`));
}
assert.ok(sw.includes(`const CACHE='remaprohub-v27-shell-${hash.digest('hex').slice(0,12)}';`),'offline cache must match packaged assets');
console.log('PWA offline shell and packaged modules OK');
