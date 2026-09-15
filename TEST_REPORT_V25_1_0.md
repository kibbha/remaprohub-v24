# Test report — ReMaPro Hub V25.1.0

## Static checks

- JavaScript `node --check` : PASS
- Bash `bash -n native/scripts/prepare-android.sh` : PASS
- YAML install/build : PASS
- JSON manifest/package/update-manifest : PASS
- ZIP integrity : PASS
- version synchronization : PASS
- required PWA icons : PASS
- native assets : PASS
- every inline event-handler function has a matching definition : PASS
- literal `getElementById` targets : PASS (remaining calculator IDs are dynamic modal fields)
- all navigation IDs have corresponding `<section class="view">` : PASS
- all render functions called by `renderAll()` exist : PASS
- no demo placeholder `Module prêt à être utilisé` : PASS
- saved professional document list : PASS
- RH calculators : PASS
- new management modules : PASS

## Android

The workflow creates Android from a clean Capacitor project, generates native assets, applies the camera permission with XML validation before Gradle, syncs the web app, and builds the debug APK.

A full Gradle build remains runner-dependent because Android/Node dependencies are downloaded on GitHub Actions.

## Functional scope

This version is intended as the complete functional test base. Visual redesign is intentionally frozen while the business workflows are validated module by module.
