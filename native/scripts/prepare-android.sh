#!/usr/bin/env bash
set -euo pipefail
MANIFEST="android/app/src/main/AndroidManifest.xml"
if [ ! -f "$MANIFEST" ]; then
  echo "AndroidManifest.xml introuvable: $MANIFEST" >&2
  exit 1
fi
python3 - <<'PY'
from pathlib import Path
import re
p=Path("android/app/src/main/AndroidManifest.xml")
s=p.read_text(encoding="utf-8")
if "android.permission.CAMERA" not in s:
    m=re.search(r"<manifest\b[^>]*>", s, flags=re.S)
    if not m:
        raise SystemExit("Balise <manifest> introuvable")
    insert='\n    <uses-permission android:name="android.permission.CAMERA" />'
    s=s[:m.end()]+insert+s[m.end():]
    p.write_text(s, encoding="utf-8")
PY
# Parse XML to catch the exact class of failure seen in GitHub Actions
python3 - <<'PY'
from pathlib import Path
import xml.etree.ElementTree as ET
p=Path("android/app/src/main/AndroidManifest.xml")
if p.exists():
    ET.parse(p)
PY
