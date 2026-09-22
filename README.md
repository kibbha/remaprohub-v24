# ReMaPro Hub

Reconstruction propre de ReMaPro Hub.

Architecture: PWA modulaire + Capacitor Android. Les traductions sont natives au rendu, sans traduction DOM a posteriori.

Langues actives de release: fr, en, de, it.
Langues legacy conservées dans le catalogue mais non proposées dans la sélection active: es, pt, nl, zh.

## Structure
- `app/` application web packagée
- `src/` logique modulaire
- `.github/workflows/android.yml` build Android de validation/final (APK debug + AAB release signé si les secrets sont configurés)
- `capacitor.config.json` configuration Android
- `supabase/` migrations et Edge Functions backend
- `docs/` préparation Google Play, sécurité des données et release candidate

## PWA et Android

Exécuter `npm run pack:web` après toute modification de `src/`, puis servir le dossier `app/` en HTTPS pour la PWA. Le workflow Android exécute cette même étape avant la synchronisation Capacitor. Le service worker garde seulement les fichiers de l’interface pour un démarrage hors connexion ; les données métier restent dans le stockage local de l’appareil.

Le workflow Android final reste volontairement déclenché manuellement ou par le sentinel `.github/final-build-trigger` afin d’éviter de consommer inutilement le quota GitHub Actions pendant le développement.

Icônes Tabler Icons (licence MIT) intégrées localement dans `app/icons.svg` pour fonctionner hors connexion. Source : https://github.com/tabler/tabler-icons
