# ReMaPro Hub

Reconstruction propre de ReMaPro Hub.

Architecture: PWA modulaire + Capacitor Android. Les traductions sont natives au rendu, sans traduction DOM a posteriori.

Langues release: fr, en, de, it, es, pt. NL/ZH pourront etre ajoutes lorsque leurs catalogues seront complets.

## Structure
- `app/` application web
- `src/` logique modulaire
- `.github/workflows/android.yml` build APK
- `capacitor.config.json` configuration Android

## PWA et Android

Exécuter `npm run pack:web` après toute modification de `src/`, puis servir le dossier `app/` en HTTPS pour la PWA. Le workflow Android exécute cette même étape avant la synchronisation Capacitor. Le service worker garde seulement les fichiers de l’interface pour un démarrage hors connexion ; les données métier restent dans le stockage local de l’appareil.

Icônes Tabler Icons (licence MIT) intégrées localement dans `app/icons.svg` pour fonctionner hors connexion. Source : https://github.com/tabler/tabler-icons
