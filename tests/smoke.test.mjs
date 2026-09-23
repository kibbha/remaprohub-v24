import fs from 'node:fs';
import assert from 'node:assert/strict';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const pkg=JSON.parse(read('package.json'));
const appVersion=read('src/app.js').match(/APP_VERSION='([^']+)'/)?.[1];assert.equal(appVersion,pkg.version);
const app=read('src/app.js'),layout=read('src/layout.js'),printer=read('src/printer.js'),sw=read('sw.js'),cloud=read('src/cloud.js'),db=read('src/db.js');
for(const token of ['publishedLayout','openItemConfigurator','data-layout-product','modifierPriceDelta','modifierSummary','modifiers:Array.isArray','layout_version'])assert.ok(app.includes(token),token);
for(const token of ['modifierRoutesToStation','configurationForButton','menuChoiceProducts'])assert.ok(layout.includes(token),token);
assert.ok(printer.includes('modifierText'));
assert.ok(printer.includes('modifierRoutes'));
assert.ok(sw.includes('remapro-pos-shell-v0270-brand-initials-20260923'));
assert.ok(sw.includes('./src/layout.js'));
assert.ok(db.includes('CapacitorSQLite'));
assert.doesNotMatch(cloud,/service[_-]?role/i);
console.log(`ReMaPro POS ${pkg.version} layout/modifier checks passed`);

const ui=read('src/ui.js');
for(const token of [
  "document.querySelectorAll('#progressive-payment-modal').forEach",
  'id="progressive-tip" inputmode="decimal" value="" placeholder="0.00"',
  'input name="opening" inputmode="decimal" value="" placeholder="0.00" required',
  "label:t('countedCash'),value:'',placeholder:'0.00'",
  "submit.textContent='Encaissement…'"
]) assert.ok(app.includes(token),token+' regression');
assert.ok(ui.includes('f.placeholder!=null')&&ui.includes('esc(f.placeholder)'),'generic prompt placeholder support');
const progressiveFlow=app.slice(app.indexOf("action:'pay_allocated_group'"),app.indexOf("async function splitCheckout"));
assert.ok(progressiveFlow.indexOf('closeProgressiveModal();')<progressiveFlow.indexOf('await Promise.all([refreshFloorData(),refreshReceipts()])'),'payment modal closes before network refresh');
assert.equal(/value="0\.00"/.test(progressiveFlow),false,'progressive money fields must not be prefilled with zero');
