import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const start = html.indexOf('const I18N=');
const end = html.indexOf('let state=loadState()', start);
assert.ok(start >= 0 && end > start, 'i18n runtime must be extractable');

class TextNode {
  constructor(value) { this.nodeType = 3; this.nodeValue = value; }
}
class Element {
  constructor(tagName, text = '') {
    this.tagName = tagName.toUpperCase(); this.dataset = {}; this.children = [];
    this.childNodes = text ? [new TextNode(text)] : []; this.attributes = new Map(); this.value = ''; this.innerHTML = '';
  }
  append(...children) { this.children.push(...children); }
  matches(selector) { return selector === '*' || (selector === 'option' && this.tagName === 'OPTION') || (selector === 'input,textarea' && ['INPUT', 'TEXTAREA'].includes(this.tagName)); }
  querySelectorAll(selector) {
    const all = this.children.flatMap(child => [child, ...child.querySelectorAll('*')]);
    if (selector === '*') return all;
    if (selector === 'option') return all.filter(element => element.tagName === 'OPTION');
    if (selector === 'input,textarea') return all.filter(element => ['INPUT', 'TEXTAREA'].includes(element.tagName));
    return [];
  }
  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributes.get(name); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  get textContent() { return this.childNodes.map(node => node.nodeValue).join(''); }
  set textContent(value) { this.childNodes = [new TextNode(String(value))]; }
}

const body = new Element('body');
const visibleHeading = new Element('h2', 'Tableau de bord');
const dynamicEmptyState = new Element('div', 'Aucune vente enregistrée');
body.append(visibleHeading, dynamicEmptyState);
const desktop = new Element('button'); desktop.dataset.nav = 'dashboard';
const mobile = new Element('button'); mobile.dataset.mnav = 'dashboard';
const more = new Element('button'); more.dataset.mnav = 'plus';
const pageTitle = new Element('h1', 'Tableau de bord');
const pageSub = new Element('p', 'Votre restaurant, piloté depuis un seul hub.');
const appLanguage = new Element('select');
const profileLanguage = new Element('select');
const ids = { pageTitle, pageSub, appLanguage, profileLanguage };
const document = {
  body, documentElement: { lang: 'fr' },
  getElementById: id => ids[id] ?? null,
  querySelectorAll: selector => selector === '[data-nav]' ? [desktop] : selector === '[data-mnav]' ? [mobile, more] : selector === 'body *' ? body.querySelectorAll('*') : [],
};
const context = vm.createContext({ document, console });
const bootstrap = `${html.slice(start, end)}
let state={preferences:{language:'fr'}};let currentView='dashboard';
function esc(value){return String(value)}
globalThis.audit={I18N,translateString,applyLanguage,applyFullLanguage,state};`;
vm.runInContext(bootstrap, context);

const expected = {
  fr: ['Tableau de bord', 'Tableau de bord'], en: ['Dashboard', 'Dashboard'], de: ['Dashboard', 'Dashboard'],
  it: ['Dashboard', 'Dashboard'], es: ['Panel', 'Panel'], pt: ['Painel', 'Painel'], nl: ['Dashboard', 'Dashboard'], zh: ['仪表盘', '仪表盘'],
};
for (const language of ['fr', 'en', 'de', 'it', 'es', 'pt', 'nl', 'zh', 'fr']) {
  context.audit.state.preferences.language = language;
  context.audit.applyLanguage(); context.audit.applyFullLanguage();
  assert.equal(document.documentElement.lang, language);
  assert.ok(desktop.textContent.trim().endsWith(expected[language][0]));
  assert.match(mobile.innerHTML, new RegExp(expected[language][0].split(' ')[0]));
  assert.equal(pageTitle.textContent, expected[language][1]);
  assert.equal(appLanguage.value, language); assert.equal(profileLanguage.value, language);
  if (language !== 'fr') assert.notEqual(pageSub.textContent, 'Votre restaurant, piloté depuis un seul hub.');
}
assert.equal(visibleHeading.textContent, 'Tableau de bord', 'the full cycle must return DOM text to French');
assert.equal(dynamicEmptyState.textContent, 'Aucune vente enregistrée', 'dynamic text must return to French');
for (const language of ['en', 'de', 'it', 'es', 'pt', 'nl', 'zh']) {
  assert.notEqual(context.audit.translateString('Tableau de bord', language), 'Tableau de bord');
  assert.notEqual(context.audit.translateString('Aucune vente enregistrée', language), 'Aucune vente enregistrée');
}
console.log('I18N DOM cycle passed: FR → EN → DE → IT → ES → PT → NL → ZH → FR.');
