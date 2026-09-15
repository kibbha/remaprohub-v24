# ReMaPro Hub V25.5.3

Version corrective dédiée au plein écran mobile et à la navigation.

- PWA `display: fullscreen` avec `display_override`.
- Android : masquage des barres système via `WindowInsetsController`, réapplication dans `onResume` et `onWindowFocusChanged`.
- Barre d’onglets repositionnée avec prise en compte de la safe-area.
- Marge basse renforcée pour empêcher le contenu d’être masqué par la navigation.
- Navigation interne Retour / Accueil conservée.
- Build Android sans cache Gradle avant création du projet.

Fichiers de livraison :
- `ReMaPro_Hub_ReMaPro_Hub_V25_5_2_READY.zip`
- `.github/workflows/install-v25-5-3.yml`
- `.github/workflows/build-android-v25-5-3.yml`


## V25.5.3 — correction workflow
- Vérification JavaScript sans processus de substitution `/proc/*/fd/pipe`, afin d’éviter les erreurs `ENOENT` / `Broken pipe` du runner GitHub Actions.
- Validation Android sans `onResume()` dans `MainActivity`, compatible avec Capacitor 8.
