#!/usr/bin/env bash
set -euo pipefail

apk=${1:?Informe o APK a testar}
app=br.com.workeasy

sha256sum "$apk"
adb shell getprop ro.build.version.sdk
adb shell getprop ro.product.cpu.abi
adb install "$apk"
adb shell pm path "$app" | grep -F 'package:'

open_home() {
  adb shell am start -W -n "$app/.MainActivity"
  local screen
  screen=$(mktemp)
  for attempt in {1..15}; do
    if adb shell uiautomator dump /sdcard/workeasy-screen.xml >/dev/null && adb pull /sdcard/workeasy-screen.xml "$screen" >/dev/null && python3 - "$screen" <<'PYXML'
import sys
import xml.etree.ElementTree as ET
nodes = ET.parse(sys.argv[1]).iter('node')
sys.exit(0 if any('O que você precisa?' in (node.get('text'), node.get('content-desc')) for node in nodes) else 1)
PYXML
    then
      rm -f "$screen"
      return 0
    fi
    sleep 2
  done
  if [[ -s "$screen" ]]; then
    python3 - "$screen" <<'PYXML'
import sys
import xml.etree.ElementTree as ET
for node in ET.parse(sys.argv[1]).iter('node'):
    label = node.get('text') or node.get('content-desc')
    if label:
        print(node.get('package'), label[:100])
PYXML
  fi
  rm -f "$screen"
  adb logcat -d -s 'Capacitor/Console:E' 'AndroidRuntime:E' | tail -40
  echo 'O campo de busca da Home não apareceu no WebView.' >&2
  return 1
}

open_home
adb shell am force-stop "$app"
open_home
adb uninstall "$app"
if adb shell pm list packages | tr -d '\r' | grep -Fx "package:$app"; then
  exit 1
fi
