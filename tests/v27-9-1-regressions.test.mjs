import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PAYMENT_METHODS,recordDetailedFinance} from '../src/store.js';
import {blankFinanceEntry} from '../src/restored.js';

globalThis.localStorage={getItem(){return null},setItem(){},removeItem(){}};

const state={financeHistory:[],expenseEntries:[],orders:[],purchases:[],revenue:0,covers:0,expenses:0};
recordDetailedFinance(state,{date:'2026-09-13',covers:25,payments:{cash:500,visa:250,mastercard:250}});
const saved=state.financeHistory.find(x=>x.date==='2026-09-13');
assert.equal(saved.covers,25);
assert.equal(saved.payments.cash,500);
assert.equal(saved.payments.visa,250);
assert.equal(saved.payments.mastercard,250);

const nextDraft=blankFinanceEntry('2026-09-20');
assert.equal(nextDraft.date,'2026-09-20');
assert.equal(nextDraft.covers,'');
for(const method of PAYMENT_METHODS)assert.equal(nextDraft.payments[method],'',method+' must reset on date change');
assert.equal(saved.payments.cash,500,'reset must not delete saved finance history');

const restored=readFileSync('src/restored.js','utf8');
assert.match(restored,/financeEntryForm\?\.querySelector\('\[name="date"\]'\)\?\.addEventListener\('change',resetFinanceEntryDraft\)/);
assert.match(restored,/querySelectorAll\('\[name\^="pay_"\]'\)\.forEach\(input=>input\.value=''\)/);
assert.match(restored,/data-payment-total>\$\{money\(0\)\}/);

const app=readFileSync('src/app.js','utf8');
const css=readFileSync('app/styles.css','utf8');
assert.match(app,/class="back-arrow"[^>]*>←<\/span><span class="back-label">\$\{t\('back'\)\}<\/span>/);
assert.match(css,/\.back\{[^}]*color:var\(--accent\)/);
assert.match(css,/\.back-arrow\{[^}]*font-size:25px/);
assert.match(css,/\.back-label\{[^}]*font-size:13px/);
assert.match(css,/@media\(max-width:620px\)\{\.back\{[^}]*width:48px/);

const icon=readFileSync('android-native/ic_launcher.xml','utf8');
const roundIcon=readFileSync('android-native/ic_launcher_round.xml','utf8');
const safeForeground=readFileSync('android-native/remaprohub_foreground.xml','utf8');
assert.match(icon,/@drawable\/remaprohub_foreground/);
assert.match(roundIcon,/@drawable\/remaprohub_foreground/);
assert.match(safeForeground,/@drawable\/remaprohub_logo/);
for(const side of ['Left','Top','Right','Bottom'])assert.match(safeForeground,new RegExp(`android:inset${side}="21dp"`));

console.log('V27.9.1 finance reset, visible back control and safe adaptive launcher icon OK');
