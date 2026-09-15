# Changelog — ReMaPro Hub

## V25.4.0 — Android pipeline correction

- Corrige le blocage GitHub Actions dans `Setup Java 21`.
- `actions/setup-java@v5` n’utilise plus le cache Gradle avant la création du projet Android.
- Le projet Android est généré proprement par Capacitor avant l’activation du cache Gradle.
- Java 21 et Node 24 sont conservés pour Capacitor 8.
- Validation XML du manifest et validation de l’activité immersive avant compilation.
- Plein écran Android et navigation interne V25.3 conservés.

# Changelog

## V25.4.0 — Plein écran Android & navigation interne
- Correction du mode plein écran Android avec activité native Java et WindowInsets.
- Les barres système Android sont masquées en mode immersif afin de ne plus recouvrir la barre d’onglets.
- Réapplication automatique du mode immersif après une réapparition temporaire des barres système.
- Ajout d’un historique de navigation entre les vues.
- Ajout d’un bouton **Retour** et d’un bouton **Fermer / Accueil** sur les pages secondaires.
- Le bouton Retour est localisé avec la langue active.
- Amélioration de la gestion de la hauteur mobile (`dvh`) et des zones sûres.
- Workflow Android simplifié : plus de génération automatique d’assets susceptible de perturber le manifeste XML.

## V25.2.0 — Abonnements & modèle commercial
- Essai gratuit de 7 jours avec accès complet.
- Standard : 9,99 CHF/mois ou 99 CHF/an.
- Multi : 14,99 CHF/mois ou 150 CHF/an.
- Gestion des restaurants, managers et accès personnel.
- Espace Abonnement dédié et gestion depuis Paramètres.
- Mode test local sans paiement réel ; Stripe prévu côté serveur pour la production.

HANGELOG — ReMaPro Hub

## V25.1.2 — 15 septembre 2026
- Correction complète du changement de langue après rendu dynamique.
- Normalisation des traductions pour que les contenus français et anglais générés par les modules puissent être reconnus et convertis dans la langue active.
- Correction des dictionnaires allemand et italien qui étaient mal structurés dans V25.1.1.
- Renforcement des traductions de navigation, statuts, actions et états vides.
- Ajout d’un onglet **Aide & formation** accessible depuis la navigation et le menu Plus.
- Guide pratique : démarrage, stock/achats, recettes/marge, HACCP, équipe/RH, documents, Copilot, stock par photo et méthode de pilotage.
- Les boutons d’aide depuis Paramètres > À propos ouvrent désormais directement le centre d’aide.
- Version web, PWA et Android synchronisée en 25.1.2.

## V25.1.1

- Correctif du workflow d’installation : le tableau de bord `view active` est maintenant correctement reconnu par l’audit des vues.
- Audit navigation/vues renforcé : 29 entrées de navigation et 29 vues validées.
- Version web/native/service worker synchronisée en 25.1.1.
- Aucun changement de la base visuelle Signature.

# CHANGELOG ReMaPro Hub

## V25.1.0
- Base visuelle V25 conservée volontairement.
- Réintégration et raccordement des fonctions métier principales.
- Navigation complète et accès mobile via Plus.
- Stock : CRUD, catégories, seuils, mouvements et capture photo.
- Recettes : ingrédients, coût matière, portions et food cost.
- HACCP : contrôles, seuils et actions correctives.
- Équipe, tâches, clients, POS et réservations : création, modification, suppression et suivi.
- Finance : CA journalier, moyens de paiement, dépenses, résultat et contrôle caisse.
- Achats, fournisseurs, traçabilité et pertes : CRUD complet.
- Documents professionnels : PDF, téléchargement, remplissage, sauvegarde, modification et impression.
- RH : formulaires et calculateurs opérationnels.
- Nouveaux modules : maintenance, briefing, passation, incidents, KPI hebdomadaire et échéances conformité.
- Copilot local/cloud et analyse photo stock IA optionnelle.
- Export/import et stockage local conservés.
- Android : workflow propre, TypeScript explicite et validation du manifeste avant Gradle.
