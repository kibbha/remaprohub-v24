import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
for(const token of [
  'selectedTicket:null','messages:[]','pos-support-reply-form','data-pos-support-open',
  'data-pos-support-back','data-pos-support-resolve','loadPosSupportConversation',
  "action:'get_ticket'","action:'reply'","action:'resolve'",
  'replyPosSupportConversation','resolvePosSupportConversation'
]) {
  if(!app.includes(token)) throw new Error('Missing POS support conversation token: '+token);
}
console.log('POS support conversation lifecycle OK');
