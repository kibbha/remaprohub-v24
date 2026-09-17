import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
const patch=readFileSync(new URL('../tools/patch_language_runtime.py',import.meta.url),'utf8');
const releaseLanguages=['fr','en','es','de','it','pt'];

assert.match(patch,/supported=\['fr','en','es','de','it','pt'\]/,'runtime patch must restrict the release language selector to six languages');
for(const lang of releaseLanguages) assert.match(source,new RegExp(`\\b${lang}:\\{`),`translation catalogue ${lang} must exist`);

// The Android workflow patches app/index.html before running this test. Validate the
// generated release catalogue itself rather than merely counting source literals.
const marker='const RMP_RELEASE_UI=';
const start=source.indexOf(marker);
assert.ok(start>=0,'generated RMP_RELEASE_UI catalogue must exist');
const end=source.indexOf(';\nfunction translateString',start);
assert.ok(end>start,'generated RMP_RELEASE_UI catalogue must terminate before translateString');
const release=vm.runInNewContext(`(${source.slice(start+marker.length,end)})`);
assert.deepEqual(Object.keys(release).sort(),['de','en','es','it','pt']);

const dashboardStrings=[
 'Chiffre d’affaires','Couverts','Panier moyen','Évolution du chiffre d’affaires','Activité récente',
 'Aucune activité récente.','À faire aujourd’hui','Hygiène & HACCP','Stock valorisé','Aucune vente enregistrée',
 'total du jour','calculé depuis vos recettes','Activité du jour','Dernières actions enregistrées','Contrôle températures',
 'À faire','Contrôles réalisés','Ouvrir HACCP','Aucun article','Gérer le stock'
];
for(const lang of ['en','es','de','it','pt']){
  for(const text of dashboardStrings){
    assert.equal(typeof release[lang]?.[text],'string',`${lang}: missing dashboard translation for ${text}`);
    assert.notEqual(release[lang][text],text,`${lang}: untranslated dashboard string ${text}`);
  }
}
assert.doesNotMatch(source,/<option value="(?:nl|zh)">(?![^<]*disabled)/,'Dutch and Chinese must not remain selectable in the generated release');
console.log('I18N six-language generated catalogue checks passed.');
