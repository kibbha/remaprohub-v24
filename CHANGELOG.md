# Changelog

## V24.0.2
- Workflow Android autonome : bootstrap depuis le ZIP si la source n'est pas encore installée.
- Vérifications de source et de version durcies.
- Génération Android neuve à chaque build.
- Manifest caméra validé avant Gradle.
- Cache PWA et stockage versionnés V24.0.2.

## V24.0.2
- Corrected Android bootstrap: TypeScript is explicitly installed because `capacitor.config.ts` requires it.
- Android project is generated from a clean state.
- Build workflow validates the TypeScript/Capacitor toolchain before `cap add android`.
