import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../src/tap-to-pay.js',import.meta.url),'utf8');
const java=fs.readFileSync(new URL('../android-native/TapToPayPlugin.java',import.meta.url),'utf8');
const activity=fs.readFileSync(new URL('../android-native/MainActivity.java',import.meta.url),'utf8');
const patch=fs.readFileSync(new URL('../scripts/patch-network-printer.mjs',import.meta.url),'utf8');

assert.ok(app.includes("integration_mode||'')==='tap_to_pay'"));
assert.ok(app.includes("startTapToPayPayment"));
assert.ok(app.includes("cancel_terminal_intent"));
assert.ok(bridge.includes("globalThis.Capacitor?.Plugins?.TapToPay"));
assert.ok(bridge.includes("result?.started!==true"));
assert.ok(java.includes('@CapacitorPlugin(name = "TapToPay")'));
assert.ok(java.includes('PackageManager.FEATURE_NFC'));
assert.ok(java.includes('sdkLinked = false'));
assert.ok(java.includes('call.reject("WORLDLINE_SDK_NOT_LINKED")'));
assert.ok(activity.includes('registerPlugin(TapToPayPlugin.class);'));
assert.ok(patch.includes("android-native/TapToPayPlugin.java"));
console.log('Worldline Tap to Pay native readiness checks passed');
