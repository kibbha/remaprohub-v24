import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

const checks=[
  ['poll interval is bounded',app.includes('const HUB_CONFIG_POLL_MS=15000')],
  ['poll requests current Hub layout',app.includes("action:'layout_current'")&&app.includes('syncPublishedHubConfiguration')],
  ['new published layout replaces cached bootstrap layout',app.includes("state.bootstrap={...(state.bootstrap||{}),layout:next}")&&app.includes("kvSet(catalogKey(state.restaurant.id),state.bootstrap)")],
  ['polling pauses while app is hidden',app.includes("document.visibilityState==='hidden'")],
  ['foreground forces a Hub configuration check',app.includes("visibilitychange")&&app.includes("syncPublishedHubConfiguration({force:true})")],
  ['network recovery forces a Hub configuration check',app.includes("window.addEventListener('online'")&&app.includes("syncPublishedHubConfiguration({force:true})")],
  ['offline behavior keeps last cached bootstrap',app.includes("const cached=await kvGet(catalogKey(restaurant.id));if(cached)state.bootstrap=cached")]
];
for(const [name,ok] of checks)if(!ok)throw new Error('Hub config sync guard failed: '+name);
console.log('hub-config-sync.test.mjs: OK');
