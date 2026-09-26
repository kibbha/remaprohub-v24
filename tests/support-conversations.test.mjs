import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
for(const token of [
  'selectedTicket:null','messages:[]','supportReplyForm','data-support-open',
  'data-support-back','data-support-resolve','loadSupportConversation',
  "action:'get_ticket'","action:'reply'","action:'resolve'",
  'replySupportConversation','resolveSupportConversation'
]) {
  if(!app.includes(token)) throw new Error('Missing Hub support conversation token: '+token);
}
console.log('Hub support conversation lifecycle OK');
