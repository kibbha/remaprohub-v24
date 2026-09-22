import fs from 'node:fs';
const url=String(process.env.SUPABASE_URL||'').trim().replace(/\/+$/,'');
const key=String(process.env.SUPABASE_PUBLISHABLE_KEY||'').trim();
if(!/^https:\/\//.test(url))throw new Error('SUPABASE_URL missing or invalid');
if(!key)throw new Error('SUPABASE_PUBLISHABLE_KEY missing');
const js=`globalThis.REMAPRO_SUPABASE_URL=${JSON.stringify(url)};\nglobalThis.REMAPRO_SUPABASE_PUBLISHABLE_KEY=${JSON.stringify(key)};\n`;
fs.writeFileSync(new URL('../runtime-config.js',import.meta.url),js);
console.log('Runtime public Supabase config injected.');
