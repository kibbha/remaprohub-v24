import fs from 'node:fs';
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
const manifest=fs.readFileSync(new URL('../app/manifest.json',import.meta.url),'utf8');
const cap=JSON.parse(fs.readFileSync(new URL('../capacitor.config.json',import.meta.url),'utf8'));
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

for(const token of ['platform_context','platform_inbox','platform_ticket','platform_reply','platform_review_approval','platform_job_action','AI Operations','Support clients','Équipe IA','Travaux développeur','Validations humaines']) {
  if(!app.includes(token)) throw new Error('Missing Ops token: '+token);
}
if(cap.appId!=='com.remaprohub.ops')throw new Error('Wrong Ops package id');
if(cap.appName!=='ReMaPro OPS')throw new Error('Wrong Ops app name');
if(pkg.name!=='remapro-ops'||pkg.version!=='0.1.0')throw new Error('Wrong Ops package metadata');
if(!index.includes('<title>ReMaPro Ops</title>'))throw new Error('Ops title missing');
if(!manifest.includes('"short_name":"ReMaPro OPS"'))throw new Error('Ops manifest branding missing');
if(app.includes('recordRestaurant(')||app.includes('renderPosLayoutEditor('))throw new Error('Ops must not expose restaurant-management UI');
console.log('ReMaPro Ops standalone application checks passed');
