#!/usr/bin/env bash
set -euo pipefail
MANIFEST="android/app/src/main/AndroidManifest.xml"
ACTIVITY="android/app/src/main/java/com/remaprohub/app/MainActivity.java"
if [ ! -f "$MANIFEST" ]; then
  echo "AndroidManifest.xml introuvable: $MANIFEST" >&2
  exit 1
fi
python3 - <<'PY'
from pathlib import Path
import re
p=Path('android/app/src/main/AndroidManifest.xml')
s=p.read_text(encoding='utf-8')
if 'android.permission.CAMERA' not in s:
    m=re.search(r'<manifest\b[^>]*>',s,flags=re.S)
    if not m: raise SystemExit('Balise <manifest> introuvable')
    s=s[:m.end()]+'\n    <uses-permission android:name="android.permission.CAMERA" />'+s[m.end():]
p.write_text(s,encoding='utf-8')
PY
mkdir -p "$(dirname "$ACTIVITY")"
cat > "$ACTIVITY" <<'JAVA'
package com.remaprohub.app;

import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        enterImmersive();
        getWindow().getDecorView().setOnSystemUiVisibilityChangeListener(v -> enterImmersive());
    }

    private void enterImmersive() {
        Window window = getWindow();
        View decor = window.getDecorView();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = window.getInsetsController();
            if (controller != null) {
                controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                controller.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
            }
        } else {
            decor.setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            );
        }
    }
}
JAVA
python3 - <<'PY'
from pathlib import Path
import xml.etree.ElementTree as ET
p=Path('android/app/src/main/AndroidManifest.xml')
ET.parse(p)
print('AndroidManifest.xml valide')
PY
