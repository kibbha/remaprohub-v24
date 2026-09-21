# ReMaPro Hub V27.11.0

## Objectif
ReMaPro Hub reste un assistant de gestion pour la restauration, pas un système de caisse. Cette version consolide les modules existants autour d'un cockpit manager simple et proactif.

## Nouveautés
- Cockpit « À surveiller aujourd'hui » sur le tableau de bord.
- ReMaPro AI enrichi avec le contexte opérationnel manager et des questions rapides.
- Suggestions de réapprovisionnement à partir des seuils de stock.
- Historique des prix fournisseurs alimenté par le scan IA des factures.
- Alertes sur les variations significatives de prix fournisseurs.
- Portefeuille recettes : food cost moyen, recettes hors objectif et prix cible conseillé.
- Planning : heures prévues, coût salarial estimé, taux horaires manquants et alertes de surcharge.
- HACCP : compteur de non-conformités ouvertes et export d'un dossier d'inspection PDF.
- Finance : visibilité food cost / coût de planning en complément des KPI existants.
- Intégrations : catalogue visible pour Lightspeed, Square, Bexio, Abacus et Zenchef sans fausse connexion ; les connexions live nécessitent les identifiants/API des fournisseurs.
- Synchronisation cloud étendue à l'historique des prix fournisseurs.
- Offline/PWA mis à jour pour le nouveau moteur d'intelligence.

## Backend
- remapro-sync étendu pour priceHistory.
- remapro-ai renforcé en « Manager Copilot » et connecté au secret OPENAI_API_KEY Supabase.

## Validation
- Suite complète npm test validée sur le lot V27.11 avant le dernier enrichissement planning/menu.
- Un dernier passage CI V27.11 est requis après le bump de version.
