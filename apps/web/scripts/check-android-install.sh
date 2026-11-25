#!/usr/bin/env bash
set -euo pipefail

apk=${1:?Informe o APK de depuração a testar}
app=br.com.workeasy

sha256sum "$apk"
adb shell getprop ro.build.version.sdk
adb shell getprop ro.product.cpu.abi
adb install "$apk"
adb shell pm path "$app" | grep -F 'package:'

open_home() {
  adb shell am start -W -n "$app/.MainActivity"
  local pid port
  pid=$(adb shell pidof -s "$app" | tr -d '\r')
  [[ "$pid" =~ ^[0-9]+$ ]]
  port=$(adb forward tcp:0 "localabstract:webview_devtools_remote_$pid")
  timeout 90 node scripts/check-android-search.mjs "$port"
  adb forward --remove "tcp:$port"
}

open_home
adb shell am force-stop "$app"
open_home
adb uninstall "$app"
if adb shell pm list packages | tr -d '\r' | grep -Fx "package:$app"; then
  exit 1
fi
