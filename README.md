# ReMaPro Hub V24.0.2

Clean foundation for the ReMaPro Hub restaurant management companion.

## Files
- `ReMaPro_Hub_V24_0_2_READY.zip`
- `.github/workflows/install-v24-0-2.yml`
- `.github/workflows/build-android-v24-0-2.yml`

## Android build
The Android project is generated from zero with Capacitor 7. The native package explicitly includes TypeScript because `capacitor.config.ts` is used. The workflow installs dependencies, verifies `tsc` and Capacitor, generates assets, applies Android preparation, validates the manifest, and builds a debug APK.
