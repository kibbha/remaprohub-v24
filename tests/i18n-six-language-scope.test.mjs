import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
const patch=readFileSync(new URL('../tools/patch_language_runtime.py',import.meta.url),'utf8');
const releaseLanguages=['fr','en','es','de','it','pt'];

assert.match(patch,/supported=\['fr','en','es','de','it','pt'\]/,'runtime patch must restrict the release language selector to six languages');
for(const lang of releaseLanguages) assert.match(source,new RegExp(`\\b${lang}:\\{`),`translation catalogue ${lang} must exist`);

// Visible dashboard strings reported by device testing must have translations in every release language.
const dashboardStrings=[
 'Chiffre d’affaires','Couverts','Panier moyen','Évolution du chiffre d’affaires','Activité récente',
 'Aucune activité récente.','À faire aujourd’hui','Hygiène & HACCP','Stock valorisé','Aucune vente enregistrée',
 'total du jour','calculé depuis vos recettes','Activité du jour','Dernières actions enregistrées','Contrôle températures',
 'À faire','Contrôles réalisés','Ouvrir HACCP','Aucun article','Gérer le stock'
];
for(const text of dashboardStrings){
  const escaped=text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const occurrences=(source.match(new RegExp(`['\"]${escaped}['\"]\\s*:`, 'g'))||[]).length;
  assert.ok(occurrences>=5,`${text} must be present as a translation key across the non-French release catalogues; got ${occurrences}`);
}
console.log('I18N six-language release scope checks passed.');
