import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogue,LANGS} from '../src/i18n.js';

const app=readFileSync('src/app.js','utf8');
const store=readFileSync('src/store.js','utf8');
const css=readFileSync('app/styles.css','utf8');
const pkg=JSON.parse(readFileSync('package.json','utf8'));

assert.equal(pkg.version,'27.10.0');
assert.match(app,/APP_VERSION='27\.10\.0'/);

// Finance: saved records stay in history, but entry controls reopen blank.
const finance=app.slice(app.indexOf('function finance(){'),app.indexOf('const DOCUMENT_FIELDS='));
for(const name of ['revenue','covers','expenses'])assert.match(finance,new RegExp(`name="${name}"[^>]*value=""`));
assert.doesNotMatch(finance,/dayRecord\?\.(manualRevenue|covers|manualExpenses)/);
assert.match(finance,/financeEntryResetHint/);

// Documents: editor and preview replace the list as dedicated workspaces.
assert.match(app,/document-workspace/);
assert.match(app,/document-fullpage/);
assert.match(app,/head\(t\(selected\),'documents'\)/);
assert.match(app,/head\(t\('preview'\),'documents'\)/);
assert.match(app,/openDocumentView=next=>\{editing=next;globalThis\.history\?\.pushState/);
assert.doesNotMatch(app,/document-preview'\)\?\.scrollIntoView/);
assert.doesNotMatch(app,/documentForm'\)\?\.scrollIntoView/);
const pageListener=app.slice(app.indexOf("document.querySelectorAll('[data-page]')"),app.indexOf("document.querySelectorAll('[data-period]')"));
assert.ok(pageListener.indexOf("b.classList?.contains('back')")<pageListener.indexOf("if(next===page)return"),'Back handling must run before same-page early return');

// Appearance customization is persisted and applied to the root element.
for(const name of ['accentColor','density','moduleColumns','navStyle','fontScale','radiusStyle','dashboardCompact'])assert.ok(app.includes(name),name+' missing from app');
for(const attr of ['dataset.density','dataset.columns','dataset.navStyle','dataset.fontScale','dataset.radiusStyle'])assert.ok(app.includes(attr),attr+' not applied');
assert.match(app,/style\?\.setProperty\?\.\('--accent'/);
for(const key of ['accentColor','density','moduleColumns','navStyle','fontScale','radiusStyle'])assert.ok(store.includes(key),key+' missing from defaults');
assert.match(store,/sanitizePreferences/);
assert.match(store,/validAccent/);

for(const selector of ['data-density="compact"','data-columns="1"','data-nav-style="icons"','data-font-scale="large"','data-radius-style="square"','document-fullpage'])assert.ok(css.includes(selector),selector+' CSS missing');

for(const lang of LANGS){
  const c=catalogue(lang);
  for(const key of ['financeEntryResetHint','appearance','accentColor','moduleLayout','navigationStyle','saveAppearance'])assert.ok(c[key],`${lang}/${key} missing`);
}
console.log('V27.9 finance reset, full-page documents, back navigation and personalization OK');
