import fs from 'node:fs';
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const cloud=fs.readFileSync(new URL('../src/cloud.js',import.meta.url),'utf8');
for(const token of ['pos-support-form','supportFunction','posSupportPanel','application:\'pos\''])if(!app.includes(token))throw new Error('Missing POS support token: '+token);
for(const token of ['export async function supportFunction','/functions/v1/remapro-support'])if(!cloud.includes(token))throw new Error('Missing POS support client token: '+token);
console.log('POS AI Operations support wiring OK');
