# Test report — ReMaPro Hub V25.1.2

## Contrôles statiques
- JavaScript `node --check` : PASS
- Navigation / vues : PASS
- `help` présent comme vue et entrée de navigation : PASS
- Dictionnaires `FULL_T.de` et `FULL_T.it` : objets valides, plus de tableaux mal structurés
- Moteur de traduction : prise en charge du texte source français et du texte source déjà traduit
- Version web / manifest / SW / native : 25.1.2

## Correction principale
Le changement de langue déclenche maintenant un rendu complet (`saveState()` → `renderAll()`), puis `applyFullLanguage()` retraduit les contenus générés dynamiquement. Le moteur peut également canonicaliser une chaîne anglaise vers sa clé française avant de chercher la traduction cible.

## Centre d’aide
- Onglet `help` ajouté.
- Accès depuis la navigation et le menu Plus.
- Accès depuis Paramètres > À propos.
- Parcours : démarrage, stock/achats, recettes/marge, HACCP, équipe/RH, documents, Copilot, photo stock et méthode de pilotage.

## Limite
Le build Android complet dépend de l’exécution GitHub Actions et n’est pas reproduit ici. Les contrôles de syntaxe et de structure du package sont effectués localement avant livraison.

## Language regression checks
- French source → English/German/Italian/Spanish/Portuguese/Dutch/Chinese: core module phrases covered.
- English-generated module phrases → selected language: canonicalisation through the English dictionary is active.
- Language switch now performs a full render before the final translation pass.

## Android workflow hardening
- The workflow validates the generated Android manifest immediately after `@capacitor/assets`.
- If asset generation produces malformed XML, the workflow recreates a clean Android project and continues with a valid baseline instead of failing later in Gradle.
