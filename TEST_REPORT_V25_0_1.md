# Test Report — ReMaPro Hub V25.0.1

## Correctif Android
- Script `prepare-android.sh`: insertion XML robuste après `<manifest>` : PASS
- Bash syntax: PASS
- Validation XML de manifeste après préparation: intégrée au workflow
- Permission CAMERA: vérifiée
- Version web/native synchronisée: 25.0.1

## Build
Le build Gradle doit être exécuté sur GitHub Actions. La version précédente échouait dans `PositionXmlParser`, symptôme d'un `AndroidManifest.xml` mal formé. Le workflow V25.0.1 bloque maintenant explicitement si le manifeste n'est pas un XML valide avant Gradle.
