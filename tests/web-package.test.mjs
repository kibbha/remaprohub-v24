import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';

const html=readFileSync('app/index.html','utf8');
const sw=readFileSync('app/sw.js','utf8');
const bootstrap=readFileSync('app/bootstrap.js','utf8');
const manifest=JSON.parse(readFileSync('app/manifest.json','utf8'));
const installIcon=readFileSync('app/icon.svg','utf8');
const appSource=readFileSync('src/app.js','utf8');

assert.match(html,/src="src\/app\.js"/);
assert.match(html,/src="bootstrap\.js"/);
assert.ok(html.indexOf('src="bootstrap.js"')<html.indexOf('src="src/app.js"'),'boot guard must load before app module');
assert.match(bootstrap,/serviceWorker\.register\('\.\/sw\.js'\)/);
assert.match(bootstrap,/remapro-boot-fatal/);
assert.match(bootstrap,/unhandledrejection/);
assert.equal(manifest.icons?.[0]?.src,'icon.svg');
assert.equal(manifest.icons?.[0]?.sizes,'192x192');
assert.equal(manifest.icons?.[1]?.sizes,'512x512');
assert.match(manifest.icons?.[2]?.purpose||'',/maskable/);
assert.equal(manifest.display,'standalone');
assert.match(installIcon,/viewBox="0 0 1024 1024"/);
assert.match(installIcon,/#8D7B6A/);
assert.match(installIcon,/M430 225/);
assert.doesNotMatch(installIcon,/data:image\/png;base64,/);
assert.match(appSource,/class="brand remapro-brand"/);
assert.match(appSource,/class="remapro-wordmark"/);
assert.doesNotMatch(appSource,/assets-remaprohub-logo\.png/);
assert.doesNotMatch(html,/\.\.\/src\/app\.js/);

const modules=readdirSync('src').filter(name=>name.endsWith('.js')).sort();
assert.ok(modules.includes('floor-plan.js'),'floor-plan runtime module must be packaged');
for(const module of modules){
  assert.equal(readFileSync(`app/src/${module}`,'utf8'),readFileSync(`src/${module}`,'utf8'),`packaged module differs: ${module}`);
  assert.ok(sw.includes(`src/${module}`),`service worker missing module: ${module}`);
}

const assets=JSON.parse(sw.match(/const ASSETS=(\[[\s\S]*?\]);/)?.[1]||'[]');
for(const asset of assets)assert.ok(existsSync(`app/${asset}`),`offline asset missing: ${asset}`);

const hash=createHash('sha256');
for(const asset of assets){hash.update(asset);hash.update(readFileSync(`app/${asset}`))}
assert.ok(sw.includes(`const CACHE='remaprohub-v27-shell-${hash.digest('hex').slice(0,12)}';`),'offline cache must match packaged assets');
console.log(`PWA offline shell and packaged module graph OK (${modules.length} modules)`);
