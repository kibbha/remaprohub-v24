import {mkdir,rm,copyFile,readFile,writeFile,readdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=resolve(root,'src');
const output=resolve(root,'app/src');

await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});

const moduleFiles=(await readdir(source,{withFileTypes:true}))
  .filter(entry=>entry.isFile()&&entry.name.endsWith('.js'))
  .map(entry=>entry.name)
  .sort();

if(!moduleFiles.includes('app.js'))throw new Error('src/app.js missing');
for(const name of moduleFiles)await copyFile(resolve(source,name),resolve(output,name));

// Fail the packaging step if any local ES-module dependency is missing.
for(const name of moduleFiles){
  const code=await readFile(resolve(source,name),'utf8');
  const specs=[
    ...code.matchAll(/from\s*['"]([^'"]+)['"]/g),
    ...code.matchAll(/import\s*['"]([^'"]+)['"]/g)
  ].map(match=>match[1]).filter(spec=>spec.startsWith('./')&&spec.endsWith('.js'));
  for(const spec of specs){
    const target=resolve(output,spec.slice(2));
    try{await access(target)}catch{throw new Error(`Packaged module missing: ${name} -> ${spec}`)}
  }
}

const baseAssets=['index.html','bootstrap.js','runtime-config.js','privacy-policy.html','account-deletion.html','order.html','order.css','order.js','styles.css','icons.svg','manifest.json','icon.svg'];
const fileAssets=[...baseAssets.map(name=>'./'+name),...moduleFiles.map(name=>'./src/'+name)];
const assets=['./',...fileAssets];
const hash=createHash('sha256');
for(const asset of fileAssets){hash.update(asset);hash.update(await readFile(resolve(root,'app',asset.slice(2))))}
const cache=`remaprohub-v27-shell-${hash.digest('hex').slice(0,12)}`;

const swPath=resolve(root,'app/sw.js');
let sw=await readFile(swPath,'utf8');
sw=sw.replace(/const CACHE='[^']+';/,`const CACHE='${cache}';`);
sw=sw.replace(/const ASSETS=\[[\s\S]*?\];/,`const ASSETS=${JSON.stringify(assets)};`);
if(!sw.includes(`const CACHE='${cache}';`))throw new Error('Service worker cache declaration missing');
for(const name of moduleFiles)if(!sw.includes(`"./src/${name}"`))throw new Error('Service worker module list incomplete: '+name);
await writeFile(swPath,sw);

console.log(`Web runtime packaged in app/src: ${moduleFiles.length} modules (${cache})`);
