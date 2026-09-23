import {mkdir,rm,copyFile,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'app/src');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const name of ['app.js','restored.js','i18n.js','store.js','ai.js','cloud.js','legal.js','billing.js','security.js','intelligence.js','accounting.js','pos.js','pos-layout.js','delivery-ai.js','academy-content.js','academy.js','telemetry.js','workspace-storage.js'])await copyFile(resolve(root,'src',name),resolve(output,name));
const assets=['index.html','bootstrap.js','runtime-config.js','privacy-policy.html','account-deletion.html','order.html','order.css','order.js','styles.css','icons.svg','manifest.json','icon.svg','assets-remaprohub-logo.png','src/app.js','src/restored.js','src/i18n.js','src/store.js','src/ai.js','src/cloud.js','src/legal.js','src/billing.js','src/security.js','src/intelligence.js','src/accounting.js','src/pos.js','src/pos-layout.js','src/delivery-ai.js','src/academy-content.js','src/academy.js','src/telemetry.js'];
const hash=createHash('sha256');
for(const asset of assets){hash.update(asset);hash.update(await readFile(resolve(root,'app',asset)))}
const cache=`remaprohub-v27-shell-${hash.digest('hex').slice(0,12)}`;
const swPath=resolve(root,'app/sw.js'),sw=await readFile(swPath,'utf8');
const updated=sw.replace(/const CACHE='remaprohub-v27-shell-[^']+';/,`const CACHE='${cache}';`);
if(updated===sw&&!sw.includes(`const CACHE='${cache}';`))throw new Error('Service worker cache declaration missing');
if(updated!==sw)await writeFile(swPath,updated);
console.log(`Web runtime packaged in app/src (${cache})`);
