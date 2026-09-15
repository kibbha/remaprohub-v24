# Test report — ReMaPro Hub V25.4.0

## Correction du blocage V25.3

Le build V25.3 échouait dans `Setup Java 21` parce que `actions/setup-java@v5` était configuré avec `cache: gradle` alors que le dépôt ne contenait pas encore de projet Android/Gradle au moment de cette étape.

V25.4 supprime cette dépendance circulaire : Java est installé sans cache, Capacitor crée ensuite le projet Android, puis le cache Gradle est activé après cette création.

## Contrôles locaux

- Java workflow: correction appliquée
- Node 24: OK
- TypeScript/Capacitor: présents
- Manifest Android: validé par le workflow après génération
- MainActivity Java immersive: présente après préparation
- Navigation interne: conservée
- Version: 25.4.0
