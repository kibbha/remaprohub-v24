import fs from 'node:fs';

const DEFAULT_SUPABASE_URL="https://gkbzawjlmwjweuqckuxm.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY="sb_publishable_-2UfflP8xdiwoISpcipEUg_vWKu3YuK";

const url=String(process.env.SUPABASE_URL||DEFAULT_SUPABASE_URL).trim().replace(/\/+$/,'');
const key=String(process.env.SUPABASE_PUBLISHABLE_KEY||DEFAULT_SUPABASE_PUBLISHABLE_KEY).trim();

if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url))throw new Error('SUPABASE_URL missing or invalid');
if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))throw new Error('SUPABASE_PUBLISHABLE_KEY missing or invalid');

const js=`globalThis.REMAPRO_SUPABASE_URL=${JSON.stringify(url)};\nglobalThis.REMAPRO_SUPABASE_PUBLISHABLE_KEY=${JSON.stringify(key)};\n`;
fs.writeFileSync(new URL('../runtime-config.js',import.meta.url),js);
console.log('Runtime public Supabase config injected.');
