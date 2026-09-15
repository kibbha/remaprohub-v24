# Test report V25.6.0

- JavaScript syntax: PASS (node --check)
- Static duplicate IDs: {'dashUserName': 2, 'pSupplier': 2} (dynamic modal IDs are generated only at runtime)
- Literal getElementById targets absent from static HTML: ['epLines', 'epTotal', 'mPortions', 'mPrice', 'recipeAutoCost', 'recipeAutoFC', 'recipeIngredients'] (runtime-generated calculator/recipe modal IDs are expected)
- Malformed data-rmp-data-rmp-onclick: 0
- Language engine: canonical reverse translation + cached translation lookup
- Language round-trip test: PASS (de -> en/fr for Speichern/Umsatz)
- Storage migration refs: remaprohub-v17/v18 only in migration routine
- Manifest version/display/icons: 25.6.0 / fullscreen / 3 icons
- @capacitor/assets: ^3.0.14
- Android fullscreen activity: Java BridgeActivity + onWindowFocusChanged, no onResume override
- Full native npm/Gradle build in this environment: NOT COMPLETED (npm install exceeded local execution timeout); GitHub workflow remains configured for Node 24 + Java 21.
