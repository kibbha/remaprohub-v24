import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../app/index.html',import.meta.url),'utf8');
const patch=readFileSync(new URL('../tools/patch_language_runtime.py',import.meta.url),'utf8');
const releaseLanguages=['fr','en','es','de','it','pt'];
assert.match(patch,/supported=\['fr','en','es','de','it','pt'\]/,'runtime patch must restrict the release language selector to six languages');
for(const lang of releaseLanguages) assert.match(source,new RegExp(`\\b${lang}:\\{`),`translation catalogue ${lang} must exist`);

const marker='const RMP_RELEASE_UI=';
const start=source.indexOf(marker);
assert.ok(start>=0,'generated RMP_RELEASE_UI catalogue must exist');
const end=source.indexOf(';\nfunction translateString',start);
assert.ok(end>start,'generated RMP_RELEASE_UI catalogue must terminate before translateString');
const release=vm.runInNewContext(`(${source.slice(start+marker.length,end)})`);
assert.deepEqual(Object.keys(release).sort(),['de','en','es','it','pt']);

const required=[
 'Chiffre d’affaires','Couverts','Panier moyen','Évolution du chiffre d’affaires','Activité récente','Aucune activité récente.','À faire aujourd’hui','Stock valorisé',
 'Votre restaurant. Vos chiffres. En un coup d’œil.','Gestion opérationnelle et administrative','Ouverture cuisine','Contrôle températures','Mise en place salle','Fermeture et nettoyage',
 'Stock & inventaire','Quantités, unités, valeur et mouvements.','Recettes & food cost','HACCP & sécurité alimentaire','Équipe & planning','Finance & chiffre d’affaires','Achats & fournisseurs',
 'Documents','Bibliothèque','Rechercher un document...','Plan de nettoyage','Registre températures','Matrice allergènes','Registre traçabilité','Fiche non-conformité',
 'Intégrations','Catégories & référentiels','Manager Copilot','Commandes & POS','Abonnement ReMaPro Hub','Aide & formation','CENTRE DE PARAMÉTRAGE','Langue de l’application',
 'Aucun lot enregistré.','Aucune perte enregistrée.','Nouveau fournisseur','Nouvelle commande','Nouveau lot','Saisir une perte','Nouvelle réservation','Aucun document professionnel enregistré.',
 'Mode test local','Compte & sécurité','Nouvelle version disponible','Essai gratuit','Ajouter un restaurant','Ajouter un manager','Ajouter un accès personnel'
];
for(const lang of ['en','es','de','it','pt']){
  for(const text of required) assert.equal(typeof release[lang]?.[text],'string',`${lang}: missing release translation for ${text}`);
}
assert.doesNotMatch(source,/<option value="(?:nl|zh)">(?![^<]*disabled)/,'Dutch and Chinese must not remain selectable in the generated release');
console.log(`I18N six-language broad catalogue checks passed: ${required.length} required UI strings x 5 target languages.`);
