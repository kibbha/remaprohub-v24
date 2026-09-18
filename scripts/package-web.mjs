import {mkdir,rm,copyFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=resolve(root,'app/src');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const name of ['app.js','i18n.js','store.js'])await copyFile(resolve(root,'src',name),resolve(output,name));
console.log('Web runtime packaged in app/src');
