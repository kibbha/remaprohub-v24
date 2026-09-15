# Test report — ReMaPro Hub V25.1.1

## Correctif vérifié

- Cause du blocage V25.1.0 identifiée : assertion trop stricte sur les classes des vues.
- `<section id="dashboard" class="view active">` est désormais correctement reconnu.
- Audit navigation/vues : 29 / 29 — PASS.
- Fonctions appelées par les gestionnaires inline : aucune fonction manquante — PASS.
- JavaScript : PASS.
- Bash : PASS.
- YAML : PASS.
- JSON : PASS.
- Service worker/cache : V25.1.1.
- Version web/native : 25.1.1.
- APK debug : versionName 25.1.1, versionCode 25101.

## Android

Le workflow reconstruit le projet Android depuis zéro, génère les assets, prépare la permission caméra, valide le manifeste XML, synchronise Capacitor puis compile l'APK debug.

Le build Gradle complet est exécuté sur GitHub Actions, où les dépendances Android sont disponibles.
