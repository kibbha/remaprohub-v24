# Service Hub → POS — 25 septembre 2026

## Livré

- Accueil Hub : CA avec ventes POS, tickets du jour, actualisation automatique et état explicite en cas d’échec/hors ligne.
- Les données d’un autre restaurant ne sont pas ajoutées après un changement d’établissement ; la projection ne modifie jamais le registre local.
- Préparation du service : raccourcis adaptés aux droits vers ouverture, stock, réservations, planning, HACCP, catalogue, salle, livraisons et assistant.
- POS : indicateur visible des envois, des attentes, erreurs et du mode hors ligne.
- Les notes locales en attente ne disparaissent plus lors d’un rafraîchissement du plan de salle.
- Clôture guidée : brouillons, notes, file d’attente et paiements terminal à traiter ; récapitulatif du restaurant pour la date du service ; comptage de cette caisse et résultat confirmé du serveur.
- Montants vides/invalides refusés ; protection contre double ouverture et double clôture.
- Téléphone (jusqu’à 820 px) : onglets Produits / Commande. Tablette : catalogue et ticket simultanés.
- Académie FR/EN/DE/IT mise à jour dans les deux applications.

## Fonctions existantes vérifiées par les tests

Plan de salle, transfert/fusion, disponibilités et ruptures, publication de configuration, scanner de livraisons avec validation finale, suggestions d’achats et alertes fournisseurs, entraînement POS, synchronisation et séparation des rôles.

## Validation

Suites `npm test` Hub et POS réussies. Nouveaux tests de comportement sur CA, remboursement, isolement des restaurants, queue locale, montants et handlers réels d’ouverture/clôture avec doubles de stockage/serveur. Packaging web et syntaxe vérifiés.

Aucune modification de schéma ou déploiement serveur dans ce lot. Les contrôles serveur existants restent autoritaires. Les ventes hors ligne restent possibles ; la clôture guidée exige une connexion et le rapport courant.

## À vérifier sur les APK

Le navigateur distant ne peut pas ouvrir l’aperçu localhost : la vérification visuelle sur téléphone/tablette et le scénario réel entre deux appareils ne sont pas validés ici. Vérifier ouverture, table, commande, cuisine, paiement, CA dans Hub, puis clôture. Vérifier également une coupure réseau et la reprise des envois sans doublon. Les connexions imprimante et terminal nécessitent le matériel réel.
