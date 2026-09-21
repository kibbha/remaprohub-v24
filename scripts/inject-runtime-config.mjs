import {writeFile} from 'node:fs/promises';
const revenueCat=String(process.env.REVENUECAT_ANDROID_API_KEY||'');
const supabaseUrl=String(process.env.SUPABASE_URL||'https://ohhsytkcpiwcprerunry.supabase.co').trim().replace(/\/+$/,'');
const supabaseKey=String(process.env.SUPABASE_PUBLISHABLE_KEY||'').trim();
await writeFile('app/runtime-config.js',
  `globalThis.REMAPRO_REVENUECAT_ANDROID_API_KEY=${JSON.stringify(revenueCat)};\n`+
  `globalThis.REMAPRO_SUPABASE_URL=${JSON.stringify(supabaseUrl)};\n`+
  `globalThis.REMAPRO_SUPABASE_PUBLISHABLE_KEY=${JSON.stringify(supabaseKey)};\n`
);
console.log(revenueCat?'RevenueCat Android public SDK key injected':'RevenueCat key not configured; billing remains disabled');
console.log(supabaseKey?'Supabase publishable key injected':'Supabase publishable key not configured; existing device cloud settings remain available');
