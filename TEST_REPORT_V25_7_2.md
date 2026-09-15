# Test report — ReMaPro Hub V25.7.2

- ZIP integrity: checked locally.
- JavaScript syntax: `node --check` PASS.
- Bash syntax: `bash -n native/scripts/prepare-android.sh` PASS.
- YAML syntax: validated locally with Python YAML parser.
- Manifest version/display: 25.7.2 / fullscreen.
- Capacitor assets dependency: `^3.0.5`, with CLI invocation pinned to `@capacitor/assets@3.0.5`.
- Resilient workflow: build restores V25.7.2 from the package when checkout is stale.
- Full GitHub Actions Gradle build was not executed locally; workflow is prepared for Node 24 + Java 21.
