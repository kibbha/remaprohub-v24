import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');

// Device screenshots showed these strings remaining French while English was selected.
// This regression gate requires every screenshot-confirmed literal to be represented
// in the release translation catalogue and prevents raw late textContent writes.
const frenchLeakage = [
  'Votre restaurant. Vos chiffres. En un coup d’œil.',
  'Chiffre d’affaires','Couverts','Panier moyen','Aucune vente enregistrée',
  'Évolution du chiffre d’affaires','Activité récente','Aucune activité récente.',
  'À faire aujourd’hui','Les points qui méritent votre attention',
  'Hygiène & HACCP','Contrôles réalisés','Ouvrir HACCP','Stock valorisé','Aucun article','Gérer le stock',
  'Opérations','Ouverture, service, fermeture et tâches opérationnelles.',
  'Ouverture cuisine','Contrôle températures','Mise en place salle','Contrôle caisse / fond de caisse','Fermeture et nettoyage',
  'HACCP & sécurité alimentaire','Relevés de température et actions correctives.','Aucun relevé de température.',
  'Finance & chiffre d’affaires','CA du jour','Dépenses du jour','Résultat du jour','Moyens de paiement',
  'Indicateurs du jour','Aucun paiement pour cette journée.','CA enregistré','Nombre total de couverts','Dépense moyenne',
  'Bibliothèque complète des documents professionnels et RH inclus dans ReMaPro Hub.',
  'Compte','Retour','Mode test local','Gestion opérationnelle et administrative'
];

for (const text of frenchLeakage) {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(source, new RegExp(`['\"]${escaped}['\"]`), `${text} must exist as a canonical translation key`);
  const rawWriteSingle = `.textContent='${text.replaceAll("'", "\\'")}'`;
  const rawWriteDouble = `.textContent="${text.replaceAll('"', '\\"')}"`;
  assert.equal(source.includes(rawWriteSingle), false, `${text} must not be written raw after translation`);
  assert.equal(source.includes(rawWriteDouble), false, `${text} must not be written raw after translation`);
}

assert.match(source, /requestAnimationFrame\(\(\)=>applyFullLanguage\(\)\)/, 'post-render translation pass must exist');
console.log('I18N rendered UI leakage regression checks passed.');
