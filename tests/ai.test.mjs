import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cloudConfig,cloudConfigured,saveCloudConfig,disconnectCloud,aiEndpoint,buildAiContext,callRemaproAi} from '../src/ai.js';
import {signInCloud} from '../src/cloud.js';

const values=new Map();
globalThis.localStorage={
  getItem:key=>values.get(key)??null,
  setItem:(key,value)=>values.set(key,value),
  removeItem:key=>values.delete(key)
};

assert.equal(saveCloudConfig('http://unsafe.example','key'),false);
assert.equal(saveCloudConfig('https://project.supabase.co/','anon-test-key'),true);
assert.equal(cloudConfigured(),true);
assert.deepEqual(cloudConfig(),{url:'https://project.supabase.co',key:'anon-test-key'});
assert.equal(aiEndpoint(),'https://project.supabase.co/functions/v1/remapro-ai');
let requested;
globalThis.fetch=async (url,options={})=>{
  if(url.includes('/auth/v1/token?grant_type=password')){
    const body=JSON.parse(options.body);
    assert.equal(body.email,'ai@example.com');
    assert.equal(body.password,'test-password');
    return {ok:true,json:async()=>({access_token:'user-jwt',refresh_token:'refresh-token',expires_at:4102444800})};
  }
  requested={url,options};
  return {ok:true,json:async()=>({answer:'OK'})};
};
await signInCloud('ai@example.com','test-password');

const state={
  preferences:{restaurant:'Bistro',currency:'CHF'},
  financeHistory:[{date:'2026-09-18',revenue:120,covers:8,expenses:30}],
  tasks:[['openKitchen',true],['cashCheck',false]],
  alerts:[{level:'urgent'}],
  invoices:[{status:'pending'}],
  orders:[{status:'open'}],
  stock:[{id:'rice',name:'Rice',qty:2,min:3}],
  deliveries:[],waste:[],team:[{name:'Alice'}],reservations:[{name:'Table'}]
};
const ctx=buildAiContext(state,new Date('2026-09-18T12:00:00'));
assert.equal(ctx.restaurant,'Bistro');
assert.equal(ctx.finance.day.revenue,120);
assert.equal(ctx.operations.openTasks.length,1);
assert.equal(ctx.stock.low[0].name,'Rice');

const response=await callRemaproAi({action:'chat',question:'Status?',language:'fr',context:ctx});
assert.equal(response.answer,'OK');
assert.equal(requested.url,'https://project.supabase.co/functions/v1/remapro-ai');
assert.equal(requested.options.headers.apikey,'anon-test-key');
assert.equal(requested.options.headers.Authorization,'Bearer user-jwt');

const client=readFileSync('src/ai.js','utf8');
const cloudClient=readFileSync('src/cloud.js','utf8');
const app=readFileSync('src/app.js','utf8');
const edge=readFileSync('supabase/functions/remapro-ai/index.ts','utf8');
assert.doesNotMatch(client,/OPENAI_API_KEY|api\.openai\.com/,'OpenAI secret/API endpoint must never be shipped in client code');
assert.doesNotMatch(cloudClient,/OPENAI_API_KEY|service_role|sb_secret_/,'privileged server secrets must never be shipped in cloud client code');
assert.match(edge,/Deno\.env\.get\("OPENAI_API_KEY"\)/);
assert.match(edge,/https:\/\/api\.openai\.com\/v1\/responses/);
assert.match(edge,/store:false/);assert.match(edge,/context\.manager\.readyActions/);assert.match(edge,/context\.manager\.closing/);assert.match(edge,/context\.manager\.waste/);assert.match(edge,/context\.manager\.supplierOpportunities/);assert.match(edge,/context\.manager\.setupSteps/);assert.match(edge,/daily management report/);assert.match(edge,/routine completion/);assert.match(edge,/closing readiness/);
for(const action of ['stock-photo','invoice-photo','health'])assert.match(edge,new RegExp(action));
assert.match(edge,/role:"user",content:\[\{type:"input_text"/,'vision input must use a user message content array');
assert.equal((edge.match(/role:"user",content:\[/g)||[]).length,2,'both vision actions must use documented Responses input shape');
assert.match(app,/function ai\(\)/);
assert.match(app,/id="stockPhotoInput"/);
assert.match(app,/action:'stock-photo'/);
assert.match(app,/action:'chat'/);

disconnectCloud();
assert.equal(cloudConfigured(),false);
console.log('AI client, security boundary and stock vision wiring OK');
