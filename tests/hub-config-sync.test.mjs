import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');

const checks=[
  ['poll interval is bounded',app.includes('const HUB_CONFIG_POLL_MS=15000')],
  ['poll asks for lightweight configuration head',app.includes("action:'configuration_head'")&&app.includes('syncHubManagedConfiguration')],
  ['full reload happens only through managed refresh',app.includes('refreshHubManagedConfiguration(head)')],
  ['published configuration uses atomic snapshot first',app.includes("action:'configuration_snapshot'")&&app.includes('readConfigurationSnapshot(atomic)')],
  ['legacy multi-endpoint reload remains as compatibility fallback',app.includes('Compatibility path for a backend that has not deployed atomic snapshots yet.')],
  ['managed reload includes bootstrap/catalog',app.includes("action:'bootstrap'")],
  ['managed reload includes tables',app.includes("action:'list_tables'")],
  ['managed reload includes terminals',app.includes("action:'list_terminals'")],
  ['managed reload includes printers',app.includes("action:'list_printers'")],
  ['managed reload includes provider configuration',app.includes("action:'list_provider_connections'")],
  ['managed reload refreshes operators',app.includes('await refreshOperators()')],
  ['managed configuration is persisted for offline use',app.includes("kvSet(catalogKey(restaurantId),state.bootstrap)")&&app.includes("kvSet(tablesKey(restaurantId),state.tables)")],
  ['polling pauses while app is hidden',app.includes("document.visibilityState==='hidden'")],
  ['foreground checks for Hub changes',app.includes("visibilitychange")&&app.includes("syncHubManagedConfiguration()")],
  ['network recovery checks for Hub changes',app.includes("window.addEventListener('online'")&&app.includes("syncHubManagedConfiguration()")],
  ['legacy backend keeps layout sync compatibility',app.includes("head?.legacy===true")&&app.includes("action:'layout_current'")],
  ['offline behavior keeps last cached bootstrap',app.includes("const cached=await kvGet(catalogKey(restaurant.id));if(cached)state.bootstrap=cached")]
];
for(const [name,ok] of checks)if(!ok)throw new Error('Hub config sync guard failed: '+name);
console.log('hub-config-sync.test.mjs: OK');

assert.match(app,/configurationRevision:Number\(head\?\.revision\)\|\|Number\(snapshot\.sourceRevision\)\+1/,'atomic snapshot derives the current configuration revision when no head is supplied');
assert.match(app,/await Promise\.all\(\[refreshOperators\(\),refreshTerminals\(\),refreshPrinters\(\)\]\)/,'atomic configuration refresh also reloads dynamic operator and device state');

assert.match(app,/network\.online'[\s\S]{0,800}refreshOperators\(\)[\s\S]{0,200}refreshOperationalData\(\)[\s\S]{0,200}refreshAvailability\(\)/,'network resume refreshes dynamic POS state without replacing local queue data');
assert.match(app,/visibilitychange[\s\S]{0,800}refreshOperators\(\)[\s\S]{0,200}refreshOperationalData\(\)[\s\S]{0,200}refreshAvailability\(\)/,'foreground resume refreshes dynamic POS state');

assert.match(app,/const runtime=await posFunction\(\{action:'bootstrap'[\s\S]{0,500}refreshHubManagedConfiguration\(head\)[\s\S]{0,600}runtime\?\.openSession/,'atomic startup keeps runtime cash session while static configuration comes from snapshot');
assert.match(app,/state\.bootstrap=\{\.\.\.\(state\.bootstrap\|\|\{\}\),profile:runtime/,'runtime bootstrap merges only runtime metadata after atomic configuration');

assert.match(app,/state\.providerConnections=await kvGet\(providersKey\(restaurant\.id\)\)\|\|\[\]/,'offline startup prefers dedicated dynamic caches for provider state');
assert.match(app,/state\.terminals=publishedDeviceProfiles\(state\.terminals,managed\.bundle,'terminals'\)/,'published terminal profiles preserve the latest cached dynamic status');
assert.match(app,/if\(!state\.providerConnections\.length&&Array\.isArray\(managed\.providers\)\)/,'managed provider copy is only a compatibility fallback');
