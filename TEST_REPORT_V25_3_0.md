# Test report — ReMaPro Hub V25.3.0

## Correctifs
- Navigation interne : historique des vues, bouton Retour et bouton Fermer/Accueil sur les vues secondaires.
- Mobile : marge inférieure conservée pour la barre d’onglets et gestion `dvh`/safe-area.
- Android : activité native Java en mode immersif, masquage des barres système et réapplication après réapparition.
- Suppression de l’ancienne étape de génération automatique des assets Android du workflow, afin d’éviter les erreurs XML rencontrées lors des builds précédents.

## Contrôles effectués
- JavaScript : `node --check` PASS.
- Script Android : `bash -n` PASS.
- YAML : parsing PASS.
- Version synchronisée : 25.3.0.
- Manifest PWA : PASS.
- Navigation/vues : audit par parseur HTML PASS.
- Actions malformées : aucune occurrence `data-rmp-data-rmp-onclick`.
- Activité Android immersive : présence des appels `WindowInsets` status/navigation bars vérifiée.

## Compilation Android
Le workflow GitHub Actions V25.3 crée un projet Android propre, installe Capacitor, applique l’activité immersive, valide le manifeste XML puis lance Gradle. La compilation complète dépend de l’exécution sur le runner GitHub et n’a pas été simulée localement dans cet environnement.
