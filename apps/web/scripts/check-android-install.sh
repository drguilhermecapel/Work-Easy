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
  for attempt in {1..15}; do
    if adb shell uiautomator dump /sdcard/workeasy-screen.xml >/dev/null && adb shell cat /sdcard/workeasy-screen.xml | grep -F 'O que você precisa?' >/dev/null; then
      return 0
    fi
    sleep 2
  done
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
