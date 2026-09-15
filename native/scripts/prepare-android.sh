#!/usr/bin/env bash
set -euo pipefail
MANIFEST="android/app/src/main/AndroidManifest.xml"
[ -f "$MANIFEST" ] || { echo "AndroidManifest.xml introuvable"; exit 1; }
python3 - "$MANIFEST" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text()
perm='<uses-permission android:name="android.permission.CAMERA" />'
if perm not in s:
    s=s.replace('<manifest', '<manifest', 1)
    marker='\n'
    pos=s.find('>', s.find('<manifest'))
    s=s[:pos+1]+'\n    '+perm+s[pos+1:]
p.write_text(s)
PY
# Force immersive flags in the generated MainActivity without requiring Kotlin.
JAVA="android/app/src/main/java/com/remaprohub/app/MainActivity.java"
if [ -f "$JAVA" ]; then
python3 - "$JAVA" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text()
needle='super.onCreate(savedInstanceState);'
if 'SYSTEM_UI_FLAG_FULLSCREEN' not in s and needle in s:
    s=s.replace(needle, needle+'\n        getWindow().setFlags(android.view.WindowManager.LayoutParams.FLAG_FULLSCREEN, android.view.WindowManager.LayoutParams.FLAG_FULLSCREEN);\n        getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | android.view.View.SYSTEM_UI_FLAG_FULLSCREEN | android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION);')
p.write_text(s)
PY
fi
