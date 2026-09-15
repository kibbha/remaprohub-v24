# ReMaPro Hub V25.1.2

Plateforme complète de management de la restauration dans la poche.

## Correctif V25.1.2

Le workflow d’installation valide maintenant correctement le dashboard actif (`view active`) et confirme la correspondance des 29 entrées de navigation avec les 29 vues.

## Objectif V25.1.2

Cette version conserve la base visuelle actuelle et donne la priorité à la **fonctionnalité métier**. Les modules sont accessibles depuis la navigation complète et depuis le bouton **Plus** sur mobile.

## Modules opérationnels

### Pilotage
- Tableau de bord / KPI
- Finance & chiffre d’affaires
- Contrôle caisse
- KPI hebdomadaire
- Prévisions & analyse
- Manager Copilot

### Opérations
- Checklist opérationnelle
- Maintenance
- Briefing équipe
- Passation de service
- HACCP & contrôles températures
- Traçabilité
- Pertes & déchets
- Incidents & actions correctives

### Stock / achats / cuisine
- Stock & inventaire
- Mouvements de stock
- Ajout par photo / caméra
- Analyse photo par IA optionnelle
- Recettes & food cost
- Achats & fournisseurs
- Catégories & référentiels

### Équipe / RH
- Équipe & planning
- Tâches & priorités
- RH & salaires
- 6 calculateurs RH principaux
- Documents RH enregistrés et imprimables

### Vente / clients
- Commandes & POS
- Réservations & CRM
- Clients & fidélité

### Documents / administration
- Bibliothèque de documents professionnels et RH
- Recherche et filtres
- Ouverture et téléchargement PDF
- Remplissage assisté
- Sauvegarde, modification, impression et suppression des documents remplis
- Conformité
- Registre des échéances
- Intégrations
- Paramètres

## Données

Les données de test sont conservées localement avec la clé `remaprohub-data`. L'ancienne clé `remaprohub-v18` / `remaprohub-v17` est migrée silencieusement lorsque nécessaire. Export/import JSON disponible dans Sécurité & données.

## Android

Capacitor génère un projet Android propre à chaque build. TypeScript et `@capacitor/assets` sont installés explicitement. Le manifeste est validé comme XML après ajout de la permission caméra avant le lancement de Gradle.

## IA

Le Copilot fonctionne en mode local pour les tests et peut utiliser Supabase Edge Function lorsque la clé publishable/anon et le service cloud sont configurés. La clé OpenAI reste côté serveur. L'analyse photo produit est optionnelle et ne remplace pas la vérification humaine.

## Fichiers V25.1.2

- `ReMaPro_Hub_V25_1_2_READY.zip`
- `.github/workflows/install-v25-1-2.yml`
- `.github/workflows/build-android-v25-1-2.yml`

### V25.1.2
- Changement de langue renforcé sur les contenus statiques et dynamiques.
- Correction des dictionnaires allemand et italien.
- Ajout de l’onglet **Aide & formation** avec parcours pratiques et accès direct aux modules.

## V25.1.2 — Langue & aide
Le moteur de langue ne se contente plus de traduire la page initiale : après un changement de langue, les modules sont entièrement rerendus puis traduits, y compris les contenus générés dynamiquement, statuts, états vides, navigation et attributs d’interface.

Le nouvel onglet **Aide & formation** sert de mini centre de formation intégré : démarrage, stock/achats, recettes/marge, HACCP, équipe/RH, documents, Copilot, ajout de stock par photo et méthode de pilotage.
