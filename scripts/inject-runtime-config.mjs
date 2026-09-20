import {writeFile} from 'node:fs/promises';
const value=String(process.env.REVENUECAT_ANDROID_API_KEY||'');
await writeFile('app/runtime-config.js',`globalThis.REMAPRO_REVENUECAT_ANDROID_API_KEY=${JSON.stringify(value)};\n`);
console.log(value?'RevenueCat Android public SDK key injected':'RevenueCat key not configured; billing remains disabled');
