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
- Suite complète `npm test` validée sur V27.11.0 après le dernier enrichissement planning/menu.
- Validation GitHub Actions finale : succès.

## Automatisation gestion – lot 2
- Plan d’achats automatique groupé par fournisseur à partir des seuils de stock.
- Budget de réassort estimé et détection des articles sans fournisseur attribué.
- Détection des recettes touchées par les variations de prix fournisseurs.
- Vue Finance enrichie avec engagements planifiés indicatifs (réassort + planning salarial).
- Nouveau raccourci IA dédié à la préparation des achats.

## Actions prêtes à exécuter – lot 3
- Création d’un bon de commande prérempli depuis chaque suggestion d’achat associée à un fournisseur, après confirmation du manager.
- Génération en un clic des tâches correctives HACCP pour les non-conformités ouvertes, sans doublons.
- Application confirmée du prix conseillé sur une recette pour revenir à l’objectif de food cost.
- Les actions automatiques restent proposées et nécessitent une validation humaine avant toute écriture métier.

## Simplicité et positionnement – lot 4
- Le cockpit manager regroupe maintenant les actions immédiatement exécutables et les prochaines étapes de configuration.
- Les actions prêtes renvoient directement vers HACCP, achats ou recettes selon le besoin.
- Les éléments manquants de mise en route sont accessibles depuis le tableau de bord.
- L’écran de ventes/commandes est explicitement présenté comme un suivi opérationnel : ReMaPro Hub ne devient pas un système de caisse et n’encaisse aucun paiement.

## Optimisation fournisseurs – lot 5
- Comparaison automatique des derniers prix connus par fournisseur pour un même article.
- Détection du fournisseur actuellement le moins cher à partir de l’historique des factures scannées.
- Estimation de l’économie potentielle sur le prochain réassort lorsque plusieurs fournisseurs sont connus.
- Affichage des opportunités directement dans Achats, sans changer automatiquement de fournisseur.
