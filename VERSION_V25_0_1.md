# ReMaPro Hub V25.1.0

Patch Android de V25.0.0.

## Correctif principal
Le script Android d'ajout de la permission caméra insérait auparavant la balise `<uses-permission>` après la déclaration XML, ce qui pouvait rendre `AndroidManifest.xml` invalide et provoquer une erreur `PositionXmlParser` pendant le build.

V25.1.0 insère désormais la permission directement après la balise `<manifest>` et valide le XML avant la compilation Gradle.

## Version
- Web: 25.1.0
- Android versionCode: 25001
- Android versionName: 25.1.0
