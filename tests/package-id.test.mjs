import assert from 'node:assert/strict';
import fs from 'node:fs';

const cap=JSON.parse(fs.readFileSync(new URL('../capacitor.config.json',import.meta.url),'utf8'));
const java=fs.readFileSync(new URL('../android-native/NetworkPrinterPlugin.java',import.meta.url),'utf8');
const patch=fs.readFileSync(new URL('../scripts/patch-network-printer.mjs',import.meta.url),'utf8');
const workflow=fs.readFileSync(new URL('../.github/workflows/pos-android-validation.yml',import.meta.url),'utf8');

assert.equal(cap.appId,'com.remaprohub.pos');
assert.ok(java.includes('package com.remaprohub.pos;'));
assert.ok(patch.includes('com/remaprohub/pos'));
assert.ok(workflow.includes('com/remaprohub/pos/MainActivity.java'));
assert.equal(workflow.includes('com/remapro/pos/'),false);
console.log('POS Android namespace aligned with ReMaPro Hub family');
