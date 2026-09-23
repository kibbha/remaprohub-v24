import {writeFile} from 'node:fs/promises';
const revenueCat=String(process.env.REVENUECAT_ANDROID_API_KEY||'').trim();
const requireRevenueCat=String(process.env.REQUIRE_REVENUECAT||'')==='1';
if(requireRevenueCat&&!revenueCat)throw new Error('REVENUECAT_ANDROID_API_KEY_REQUIRED');
if(revenueCat&&!/^[A-Za-z0-9_\-:.]+$/.test(revenueCat))throw new Error('REVENUECAT_ANDROID_API_KEY_INVALID');
const supabaseUrl=String(process.env.SUPABASE_URL||'https://gkbzawjlmwjweuqckuxm.supabase.co').trim().replace(/\/+$/,'');
const supabaseKey=String(process.env.SUPABASE_PUBLISHABLE_KEY||'sb_publishable_-2UfflP8xdiwoISpcipEUg_vWKu3YuK').trim();
await writeFile('app/runtime-config.js',
  `globalThis.REMAPRO_REVENUECAT_ANDROID_API_KEY=${JSON.stringify(revenueCat)};\n`+
  `globalThis.REMAPRO_SUPABASE_URL=${JSON.stringify(supabaseUrl)};\n`+
  `globalThis.REMAPRO_SUPABASE_PUBLISHABLE_KEY=${JSON.stringify(supabaseKey)};\n`
);
console.log(revenueCat?'RevenueCat Android public SDK key injected':'RevenueCat key not configured; billing remains disabled');
console.log(supabaseKey?'Supabase publishable key injected':'Supabase publishable key not configured; existing device cloud settings remain available');
