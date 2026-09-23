import fs from 'node:fs';
import path from 'node:path';

const root=new URL('../',import.meta.url);
const out=new URL('../app/',import.meta.url);
const rootPath=path.resolve(root.pathname);
const outPath=path.resolve(out.pathname);

fs.rmSync(outPath,{recursive:true,force:true});
fs.mkdirSync(outPath,{recursive:true});

const files=['index.html','customer-display.html','manifest.webmanifest','runtime-config.js','sw.js'];
for(const file of files){
  fs.copyFileSync(path.join(rootPath,file),path.join(outPath,file));
}
for(const dir of ['src','assets']){
  fs.cpSync(path.join(rootPath,dir),path.join(outPath,dir),{recursive:true});
}
console.log('ReMaPro POS web runtime prepared in app/.');
