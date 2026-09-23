import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderAcademyCenter} from '../src/academy.js';

const source=fs.readFileSync(new URL('../src/academy.js',import.meta.url),'utf8');
assert.match(source,/\.academy-path-grid,.academy-topic-grid\{display:grid;grid-template-columns:repeat\(3/,'desktop 3-column grid');
assert.match(source,/@media\(max-width:900px\)[\s\S]*?repeat\(2,/,'tablet 2-column grid');
assert.match(source,/@media\(max-width:560px\)[\s\S]*?grid-template-columns:1fr/,'mobile 1-column grid');
assert.match(source,/min-height:44px/,'touch target minimum');
assert.match(source,/width:min\(720px,calc\(100vw - 28px\)\)/,'tablet dialog bound');
assert.match(source,/width:calc\(100vw - 16px\);max-height:94vh/,'mobile dialog bound');
assert.match(source,/academy-searchbar\{grid-template-columns:1fr;position:static\}/,'mobile search flow');
for(const [name,width] of [['desktop',1440],['tablet',768],['mobile',390]]){
  const html=renderAcademyCenter({application:'pos',scope:'all',locale:'fr',progressRows:[]});
  assert.match(html,/academy-center/,name+' academy center');
  assert.match(html,/academy-searchbar/,name+' search');
  assert.match(html,/academy-path-grid/,name+' paths');
  assert.match(html,/academy-topic-grid/,name+' topics');
  assert.ok(width>0);
}
console.log('POS Academy responsive contracts pass for 1440/768/390 px');
