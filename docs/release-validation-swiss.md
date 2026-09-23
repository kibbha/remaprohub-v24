# Validation RC Suisse — ReMaPro Hub V27.11.0 / POS V0.27.0

Date de préparation : 2026-09-23.

## 1. Paie suisse

Implémentation :
- `calculateSwissPayroll` renvoie `blocked:true` tant que LPP et assurance accident ne sont pas vérifiées.
- Le Hub affiche un bandeau rouge bloquant.
- Sauvegarde d'une fiche de paie suisse et export PDF refusés dans cet état.

Test manuel :
1. Paramètres > Paie suisse : décocher LPP ou Accident.
2. Ouvrir une fiche de paie suisse.
3. Vérifier le bandeau rouge et l'absence de calcul de net.
4. Vérifier que “Appliquer les totaux”, la sauvegarde et le PDF sont bloqués.
5. Vérifier LPP + Accident puis refaire : calcul, sauvegarde et PDF doivent fonctionner.

## 2. Carte + TWINT

Implémentation :
- Les moyens `card` et `twint` créent des intents de paiement POS.
- Worldline TIM / Terminal API Cloud est le chemin d'intégration suisse prioritaire.
- Aucun paiement externe n'est déclaré capturé sans confirmation prestataire.

Test manuel avant connecteur live :
1. Créer un profil terminal Worldline actif avec carte + TWINT.
2. Ouvrir un ticket et déclencher Carte puis TWINT.
3. Vérifier création d'un intent et affichage du statut.
4. Vérifier qu'un timeout/échec ne marque jamais le ticket payé.
5. Vérifier le mode manuel avec confirmation sur terminal externe.

Blocage externe : onboarding/identifiants/certification Worldline nécessaires pour capture automatique live.

## 3. Abonnement RevenueCat

Implémentation :
- `runtime-config.js` reçoit la clé publique Android au build via `REVENUECAT_ANDROID_API_KEY`.
- Les workflows Android commerciaux échouent si cette clé manque.
- Achat, restauration, entitlements et webhook Supabase sont câblés et testés.

Test manuel après ajout de la clé :
1. Ajouter le secret GitHub `REVENUECAT_ANDROID_API_KEY`.
2. Vérifier les offerings RevenueCat `standard` et `multi` avec packages mensuel/annuel.
3. Tester un achat Google Play fermé/test.
4. Fermer/réouvrir le Hub : l'abonnement doit rester actif.
5. Tester “Restaurer les achats”.
6. Vérifier la mise à jour de `subscriptions` et l'événement RevenueCat côté Supabase.

Blocage externe actuel : secret GitHub RevenueCat absent.

## 4. Imprimantes réseau ESC/POS

Implémentation :
- Nouveau bridge Android natif `NetworkPrinter`.
- TCP direct vers IP/hostname, port 9100 par défaut.
- Bluetooth et USB inchangés.

Test manuel :
1. Configurer une imprimante réseau avec IP fixe et port 9100.
2. Même Wi-Fi/LAN que le terminal Android.
3. Lancer ticket test, ticket client puis bon cuisine.
4. Vérifier accents translittérés, coupe papier et absence de doublon.
5. Couper le réseau : vérifier message d'échec sans crash.
6. Rebrancher : vérifier reprise normale.

## 5. Stock Hub ↔ POS temps réel

Implémentation :
- Une vente POS crée `pos_inventory_movements`.
- Trigger serveur applique immédiatement un événement `stockMoves` au workspace Hub.
- Déduplication par `posMovementId`.
- Le POS ne remplace jamais directement `stock.qty`.

Résolution de conflit :
- Chaque domaine du workspace a sa révision.
- Une vente POS incrémente `stockMoves`.
- Si Hub tente de pousser un ancien `stockMoves`, le serveur retourne un conflit au lieu d'écraser la vente.
- Après conflit : pull serveur puis correction sous forme de mouvement de stock.

Test manuel :
1. Associer un article POS à une référence stock Hub.
2. Noter le stock disponible.
3. Encaisser 1 article.
4. Vérifier immédiatement dans Hub la baisse correspondante.
5. Passer POS hors-ligne, vendre, modifier un autre domaine Hub, reconnecter.
6. Vérifier fusion des domaines non conflictuels et absence de double décrémentation.

## 6. Pourboires par employé

Implémentation :
- `pos_payments.tip_operator_id`.
- `tip_operator_name_snapshot` conserve l'historique.
- Le rapport Z expose les pourboires par opérateur.

Test manuel :
1. Se connecter avec serveur A, encaisser avec tip.
2. Se connecter avec serveur B, encaisser avec tip.
3. Rapport Z : vérifier montants séparés A/B.
4. Renommer A dans l'administration.
5. Vérifier que l'ancien paiement conserve le nom snapshot historique.

## 7. Nettoyage

Package IDs :
- Hub conservé : `com.remaprohub.app` pour préserver l'identité Play existante.
- POS normalisé : `com.remaprohub.pos`.

Langues :
- NL/ZH incomplets retirés.
- Langues actives : FR/EN/DE/IT.
- ES/PT restent catalogues legacy non exposés.

Supabase :
- Projet production vérifié : `gkbzawjlmwjweuqckuxm`.
- URL : `https://gkbzawjlmwjweuqckuxm.supabase.co`.
- Projet ACTIVE_HEALTHY.

Test manuel :
1. Sur un appareil ayant l'ancien POS `com.remapro.pos`, désinstaller l'ancien bêta.
2. Installer le prochain POS et vérifier coexistence avec Hub.
3. Tester les 4 langues actives.
4. Vérifier login et données cloud sur le projet Supabase de production.

## 8. Diagnostics / telemetry

Implémentation :
- Les catches silencieux ciblés dans Hub `security.js`, Hub/POS `cloud.js` et POS `printer.js` enregistrent maintenant un diagnostic.
- Le comportement utilisateur reste résilient : pas de crash ajouté.

Test manuel :
1. Simuler perte réseau pendant refresh de session.
2. Désactiver/refuser Bluetooth puis lancer détection imprimante.
3. Tester imprimante réseau inaccessible.
4. Revenir à l'écran diagnostic/support et vérifier la présence des événements anonymisés.
5. Vérifier qu'aucun token, PIN ou mot de passe n'est enregistré.

## Avant toute nouvelle APK

- Hub : suite Node complète doit passer.
- POS : suite Node complète doit passer.
- RevenueCat : secret public Android obligatoire pour Hub commercial.
- Worldline : capture automatique reste désactivée jusqu'au connecteur prestataire réel.
- Ne lancer la compilation Android qu'après les tests manuels dépendant du matériel quand celui-ci est disponible.
