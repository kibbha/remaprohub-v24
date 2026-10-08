import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {requiresExternalSettlementConfirmation} from '../src/payment-policy.js';

assert.equal(requiresExternalSettlementConfirmation('card'),true);
assert.equal(requiresExternalSettlementConfirmation('twint'),true);
assert.equal(requiresExternalSettlementConfirmation('cash'),false);
assert.equal(requiresExternalSettlementConfirmation('voucher'),false);
assert.equal(requiresExternalSettlementConfirmation('invoice'),false);

const code=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
function section(start,end){
  const i=code.indexOf(start),j=code.indexOf(end,i+start.length);
  assert.ok(i>=0&&j>i,'missing POS handler '+start);
  return code.slice(i,j);
}
const helper=section('async function confirmExternalManualSettlement(', 'function operatorSessionUsable(');
let onlineTerminal=false,decisions=[],alerts=[],checkouts=[],intents=[],prompts=[];
const state={posSettings:{payments:{}},bootstrap:{capabilities:{paymentProviders:false}}};
const ctx=vm.createContext({
  state,requiresExternalSettlementConfirmation,
  connectedTerminal:()=>onlineTerminal?{id:'terminal'}:null,
  uiAlert:message=>alerts.push(message),
  uiConfirm:async opts=>{prompts.push(opts);return decisions.shift()??true},
  checkout:async method=>{checkouts.push(method);return method},
  startTerminalPayment:async(method,terminal)=>{intents.push(method);return terminal},
  paymentAllowed:()=>true,t:k=>k
});
vm.runInContext(helper,ctx);
assert.equal(await ctx.confirmExternalManualSettlement('cash'),true);
assert.equal(prompts.length,0,'cash must not demand an external-terminal confirmation');
decisions=[false];assert.equal(await ctx.confirmExternalManualSettlement('card','Part 1'),false);
assert.equal(prompts.length,1);assert.ok(prompts[0].message.includes('Part 1'));
decisions=[true];assert.equal(await ctx.confirmExternalManualSettlement('twint','Personne 2'),true);
assert.equal(prompts.length,2);
decisions=[false];await ctx.payByMethod('card');
assert.equal(checkouts.length,0,'a declined manual card confirmation must not settle an order');
decisions=[true];await ctx.payByMethod('twint');
assert.deepEqual(checkouts,['twint']);
onlineTerminal=true;state.bootstrap.capabilities.paymentProviders=true;
assert.equal(await ctx.confirmExternalManualSettlement('card','Personne 1'),false);
assert.equal(alerts.length,1,'split card settlement must be blocked when an integrated terminal is present');
await ctx.payByMethod('card');
assert.deepEqual(intents,['card'],'standard payment must instead use the integrated provider intent');
assert.deepEqual(checkouts,['twint'],'integrated path must not mark a manual card payment');

const allocated=section('async function settleAllocatedSplit(', 'async function openAllocatedSplit(');
assert.ok(allocated.includes('await confirmExternalManualSettlement(group.method,group.label)'));
assert.ok(allocated.indexOf('confirmExternalManualSettlement')<allocated.indexOf('posFunction('),'allocated split must confirm before server settlement');
const progressive=section('async function openProgressivePayment(', 'async function splitCheckout(');
assert.ok(progressive.includes('await confirmExternalManualSettlement(method,label)'));
assert.ok(progressive.indexOf('confirmExternalManualSettlement')<progressive.indexOf("action:'pay_allocated_group'"));
const split=section('async function splitCheckout(', 'async function refundReceipt(');
assert.ok(split.includes('await confirmExternalManualSettlement(payments[i].method'));
assert.ok(split.indexOf('confirmExternalManualSettlement')<split.indexOf("queuedItem('settle_open_order_split'"));
console.log('Manual POS payment confirmation: standard, split, allocated and progressive guards passed');
