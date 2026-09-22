import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderAcademyCenter} from '../src/academy.js';

const source=fs.readFileSync(new URL('../src/academy.js',import.meta.url),'utf8');
const widths=[
  {name:'desktop',width:1440,columns:3},
  {name:'tablet',width:768,columns:2},
  {name:'mobile',width:390,columns:1}
];
assert.match(source,/\.academy-path-grid,.academy-topic-grid\{display:grid;grid-template-columns:repeat\(3/,'desktop 3-column grid');
assert.match(source,/@media\(max-width:900px\).*repeat\(2/mins,'tablet 2-column grid');
assert.match(source,/@media\(max-width:560px\).*grid-template-columns:1fr/mins,'mobile 1-column grid');
assert.match(source,/min-height:44px/,'touch target minimum');
assert.match(source,/width:min\(720px,calc\(100vw - 28px\)\)/,'tablet dialog bound');
assert.match(source,/width:calc\(100vw - 16px\);max-height:94vh/,'mobile dialog bound');
assert.match(source,/academy-searchbar\{grid-template-columns:1fr;position:static\}/,'mobile search flow');
for(const device of widths){
  const html=renderAcademyCenter({application:'hub',scope:'all',locale:'fr',progressRows:[]});
  assert.match(html,/academy-center/,device.name+' academy center');
  assert.match(html,/academy-searchbar/,device.name+' search');
  assert.match(html,/academy-path-grid/,device.name+' paths');
  assert.match(html,/academy-topic-grid/,device.name+' topics');
}
console.log('Academy responsive contracts pass for 1440/768/390 px');
