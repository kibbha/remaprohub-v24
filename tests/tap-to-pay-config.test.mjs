import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const adapters=fs.readFileSync(new URL('../src/integrations.js',import.meta.url),'utf8');
const edge=fs.readFileSync(new URL('../supabase/functions/remapro-pos-sync/index.ts',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../supabase/migrations/20260923195500_pos_worldline_tap_to_pay.sql',import.meta.url),'utf8');

assert.ok(app.includes('Worldline · Tap to Pay / Tap on Mobile'));
assert.ok(app.includes('value="tap_to_pay"'));
assert.ok(adapters.includes('Terminal API Cloud / TIM / Tap on Mobile'));
assert.ok(edge.includes('worldline:["terminal_api_cloud","tim","tap_to_pay"]'));
assert.ok(edge.includes('tapToPayPrepared:true'));
assert.ok(edge.includes('paymentProviders:false'));
assert.ok(migration.includes("integration_mode in ('cloud','tap_to_pay','external_app','local_network')"));
assert.ok(migration.includes("integration_mode in ('terminal_api_cloud','tim','tap_to_pay','direct','terminal_psp')"));
assert.ok(migration.includes("v_provider='worldline' and v_mode not in ('terminal_api_cloud','tim','tap_to_pay')"));
console.log('Worldline Tap to Pay Hub/backend readiness checks passed');
