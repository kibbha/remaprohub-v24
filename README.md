# ReMaPro Hub V25.7.2

## Correctif pipeline Android
V25.7.2 conserve les fonctionnalités de V25.7.1 et ajoute un mécanisme de restauration automatique de la source depuis le package V25.7.2 lorsque GitHub Actions démarre avec un checkout ancien.

### Fichiers synchronisés
- `ReMaPro_Hub_V25_7_2_READY.zip`
- `install-v25-7-2.yml`
- `build-android-v25-7-2.yml`

### Android
- Node 24
- Java 21
- Capacitor 8
- `@capacitor/assets` 3.0.5
- versionCode 25702
- versionName 25.7.2
- fullscreen immersif conservé

### Utilisation
1. Déposer `ReMaPro_Hub_V25_7_2_READY.zip` dans le dépôt.
2. Lancer **Install ReMaPro Hub V25.7.2**.
3. Lancer **Android ReMaPro Hub V25.7.2**.

Le workflow Android vérifie désormais la version et peut restaurer automatiquement la source depuis le ZIP si le dépôt contient encore une ancienne version.
