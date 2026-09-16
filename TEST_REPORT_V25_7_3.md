# Test report — ReMaPro Hub V25.7.3

- ZIP integrity: checked locally.
- JavaScript syntax: `node --check` PASS.
- Bash syntax: `bash -n native/scripts/prepare-android.sh` PASS.
- YAML syntax: validated locally with Python YAML parser.
- Manifest version/display: 25.7.3 / fullscreen.
- Language fix: selected language is persisted to both app state and dedicated language storage key, then the app reloads so every rendered module starts from the selected locale.
- Language restore: startup now restores the dedicated language key when valid.
- Navigation translation: all navigation entries, including POS, tasks, customers, forecast, integrations, subscription and help, have locale mappings.
- Android versionCode: 25703.
- Full GitHub Actions Gradle build was not executed locally; workflow is prepared for Node 24 + Java 21.
