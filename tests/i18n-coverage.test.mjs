import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
const start = html.indexOf('const I18N=');
const end = html.indexOf('let state=loadState()', start);
const context = vm.createContext({ console });
vm.runInContext(`${html.slice(start, end)}\nglobalThis.audit={I18N,getTranslationTables,translateString,canonicalTranslation};`, context);

const criticalVisibleLabels = [
  ...Object.values(context.audit.I18N.fr),
  'Votre restaurant, piloté depuis un seul hub.', 'Gestion opérationnelle et administrative',
  'Langue de l’application', 'Infos personnelles', 'Chiffre d’affaires', 'Mode test local',
  'Enregistrer', 'Enregistrer les modifications', 'Annuler', 'Supprimer', 'Modifier', 'Ajouter',
  'Rechercher', 'Fermer', 'Ouvrir', 'Confirmer', 'Retour', 'Suivant', 'Précédent',
  'Aujourd’hui', 'Aucune donnée', 'Aucun résultat', 'Aucune vente enregistrée', 'Plus',
];
for (const language of ['en', 'de', 'it', 'es', 'pt', 'nl', 'zh']) {
  const dictionary = Object.assign({}, ...context.audit.getTranslationTables().map(table => table[language] || {}));
  for (const label of criticalVisibleLabels) {
    const canonical = context.audit.canonicalTranslation(label);
    assert.ok(Object.hasOwn(dictionary, label) || Object.hasOwn(dictionary, canonical), `${language} lacks visible label: ${label}`);
    const translated = context.audit.translateString(label, language);
    assert.ok(typeof translated === 'string' && translated.length > 0, `${language} produces no text for: ${label}`);
    assert.doesNotMatch(translated, /Tocune|\bundefined\b|\bnull\b/, `${language} produced a corrupt translation for: ${label}`);
  }
}
console.log('Critical visible-label coverage passed for EN, DE, IT, ES, PT, NL and ZH.');
