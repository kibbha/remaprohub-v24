import assert from 'node:assert/strict';
import {catalogue,LANGS,setLanguage} from '../src/i18n.js';
const values=new Map(),listeners=new Map(),app={innerHTML:''};
globalThis.localStorage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
globalThis.Event=class{constructor(type){this.type=type}};
globalThis.window={addEventListener:(type,fn)=>listeners.set(type,fn),dispatchEvent:event=>listeners.get(event.type)?.(event)};
globalThis.document={documentElement:{lang:'fr',dataset:{}},getElementById:id=>id==='app'?app:null,querySelector:()=>null,querySelectorAll:selector=>selector==='[data-page]'?[{dataset:{page:'documents'},addEventListener:(_type,fn)=>listeners.set('navigate',fn)}]:[]};
await import('../src/app.js');
assert.match(app.innerHTML,/Tableau de bord/);
listeners.get('navigate')();
assert.match(app.innerHTML,/Remplir/);
for(const lang of LANGS){setLanguage(lang);assert.equal(document.documentElement.lang,lang);assert.equal(values.get('rmp.language'),lang);assert.match(app.innerHTML,new RegExp(catalogue(lang).documentHistory));assert.match(app.innerHTML,new RegExp(catalogue(lang).fill));}
console.log('Live language switching preserves the Documents page OK');
