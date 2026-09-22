import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  saveCloudConfig,cloudConfigured,cloudSession,signInCloud,refreshCloudSession,
  loadCloudIdentity,cloudPageAllowed,cloudMultiAccess,signOutCloud
} from '../src/cloud.js';

const values=new Map();
globalThis.localStorage={
  getItem:key=>values.get(key)??null,
  setItem:(key,value)=>values.set(key,value),
  removeItem:key=>values.delete(key)
};

assert.equal(saveCloudConfig('https://project.supabase.co/','sb_publishable_test'),true);
assert.equal(cloudConfigured(),true);

const requests=[];
globalThis.fetch=async (url,options={})=>{
  requests.push({url,options});
  if(url.includes('/auth/v1/token?grant_type=password')){
    const body=JSON.parse(options.body);
    assert.equal(body.email,'manager@example.com');
    assert.equal(body.password,'top-secret-password');
    assert.equal(options.headers.apikey,'sb_publishable_test');
    assert.equal(options.headers.Authorization,undefined);
    return {ok:true,json:async()=>({access_token:'jwt-1',refresh_token:'refresh-1',expires_in:3600,user:{id:'u1',email:'manager@example.com'}})};
  }
  if(url.includes('/auth/v1/token?grant_type=refresh_token')){
    return {ok:true,json:async()=>({access_token:'jwt-2',refresh_token:'refresh-2',expires_in:3600})};
  }
  if(url.endsWith('/auth/v1/user')){
    assert.equal(options.headers.Authorization,'Bearer jwt-1');
    return {ok:true,json:async()=>({id:'u1',email:'manager@example.com'})};
  }
  if(url.includes('/rest/v1/memberships')){
    assert.equal(options.headers.Authorization,'Bearer jwt-1');
    return {ok:true,json:async()=>[
      {id:'m1',organization_id:'org1',restaurant_id:'rest1',role:'manager',permissions:[]}
    ]};
  }
  if(url.includes('/rest/v1/restaurants')){
    return {ok:true,json:async()=>[
      {id:'rest1',organization_id:'org1',name:'Bistro',city:'Geneva',canton:'GE',country_code:'CH',currency:'CHF',active:true}
    ]};
  }
  if(url.includes('/rest/v1/organizations')){
    return {ok:true,json:async()=>[
      {id:'org1',created_at:'2026-09-15T00:00:00Z'}
    ]};
  }
  if(url.includes('/rest/v1/subscriptions')){
    return {ok:true,json:async()=>[
      {organization_id:'org1',status:'active',trial_ends_at:null,created_at:'2026-09-15T00:00:00Z',plan:{code:'multi'}}
    ]};
  }
  if(url.endsWith('/auth/v1/logout'))return {ok:true,json:async()=>({})};
  throw new Error('Unexpected request '+url);
};

const session=await signInCloud(' Manager@Example.com ','top-secret-password');
assert.equal(session.access_token,'jwt-1');
assert.equal(cloudSession().refresh_token,'refresh-1');
const persisted=values.get('remaprohub-sb-session');
assert.ok(persisted.includes('jwt-1'));
assert.doesNotMatch(persisted,/top-secret-password/,'password must never be persisted');

const identity=await loadCloudIdentity();
assert.equal(identity.user.email,'manager@example.com');
assert.equal(identity.memberships.length,1);
assert.equal(identity.restaurants[0].name,'Bistro');
assert.equal(cloudPageAllowed(identity,'finance','rest1'),true,'manager gets full assigned restaurant access');
assert.equal(identity.organizations[0].id,'org1');
assert.equal(identity.subscriptions[0].plan.code,'multi');
assert.equal(cloudMultiAccess(identity,'org1',new Date('2026-09-18T12:00:00Z')),true);

const staffIdentity={
  memberships:[{organization_id:'org1',restaurant_id:'rest1',role:'employee',permissions:['operations','stock']}],
  restaurants:[
    {id:'rest1',organization_id:'org1'},
    {id:'rest2',organization_id:'org2'}
  ]
};
assert.equal(cloudPageAllowed(staffIdentity,'stock','rest1'),true);
assert.equal(cloudPageAllowed(staffIdentity,'finance','rest1'),false);
assert.equal(cloudPageAllowed(staffIdentity,'stock','rest2'),false);
assert.equal(cloudPageAllowed(staffIdentity,'help','rest2'),true);

const crossOrgAdmin={
  memberships:[{organization_id:'org1',restaurant_id:null,role:'network_admin',permissions:[]}],
  restaurants:[{id:'rest2',organization_id:'org2'}]
};
assert.equal(cloudPageAllowed(crossOrgAdmin,'finance','rest2'),false,'org admin must not cross organization boundaries');

const trialIdentity={
  organizations:[{id:'orgTrial',created_at:'2026-09-15T00:00:00Z'}],
  subscriptions:[]
};
assert.equal(cloudMultiAccess(trialIdentity,'orgTrial',new Date('2026-09-18T12:00:00Z')),true);
assert.equal(cloudMultiAccess(trialIdentity,'orgTrial',new Date('2026-09-23T12:00:00Z')),true);
assert.equal(cloudMultiAccess(trialIdentity,'orgTrial',new Date('2026-09-30T12:00:00Z')),false);

values.set('remaprohub-sb-session',JSON.stringify({access_token:'expired',refresh_token:'refresh-1',expires_at:1}));
const refreshed=await refreshCloudSession();
assert.equal(refreshed.access_token,'jwt-2');

values.set('remaprohub-sb-session',JSON.stringify({access_token:'jwt-1',refresh_token:'refresh-1',expires_at:4102444800}));
await signOutCloud();
assert.equal(cloudSession(),null);

await signInCloud('manager@example.com','top-secret-password');
assert.ok(cloudSession());
assert.equal(saveCloudConfig('https://other.supabase.co','sb_publishable_other'),true);
assert.equal(cloudSession(),null,'changing project config must invalidate prior session');

const client=readFileSync('src/cloud.js','utf8');
assert.doesNotMatch(client,/service_role|sb_secret_|SUPABASE_SECRET/i);
assert.match(client,/Authorization':'Bearer '/);
assert.match(client,/\/auth\/v1\/token\?grant_type=password/);
assert.match(client,/\/rest\/v1\/memberships/);
assert.match(client,/cloudPageAllowed/);

console.log('Cloud auth sessions, RLS identity loading and permission guards OK');
