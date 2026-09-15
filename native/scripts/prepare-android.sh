#!/usr/bin/env bash
set -euo pipefail
MANIFEST="android/app/src/main/AndroidManifest.xml"
if [ -f "$MANIFEST" ] && ! grep -q 'android.permission.CAMERA' "$MANIFEST"; then
  python3 - <<'PY'
from pathlib import Path
p=Path("android/app/src/main/AndroidManifest.xml")
s=p.read_text()
needle='<manifest'
idx=s.find('>')
s=s[:idx+1]+'\n    <uses-permission android:name="android.permission.CAMERA" />'+s[idx+1:]
p.write_text(s)
PY
fi
