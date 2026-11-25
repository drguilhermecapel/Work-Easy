#!/usr/bin/env bash
set -euo pipefail

archive=${1:?Informe o ZIP de simulador}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
shasum -a 256 "$archive"
ditto -x -k "$archive" "$work"
bundle_id=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$work/App.app/Info.plist")
[[ "$bundle_id" == br.com.workeasy ]]

family=${2:?Informe iPhone ou iPad}
[[ "$family" == iPhone || "$family" == iPad ]]
device=$(xcrun simctl list -j devices available | python3 -c '
import json, sys
for runtime, devices in json.load(sys.stdin)["devices"].items():
    for device in devices:
        if ".iOS-" in runtime and device["name"].startswith(sys.argv[1]):
            print(device["name"], runtime, file=sys.stderr)
            print(device["udid"])
            sys.exit(0)
sys.exit("Simulador indisponível: " + sys.argv[1])
' "$family")
xcrun simctl bootstatus "$device" -b
xcrun simctl install "$device" "$work/App.app"
xcrun simctl launch "$device" "$bundle_id"
sleep 5
xcrun simctl terminate "$device" "$bundle_id"
xcrun simctl launch "$device" "$bundle_id"
xcrun simctl uninstall "$device" "$bundle_id"
if xcrun simctl get_app_container "$device" "$bundle_id" app >/dev/null 2>&1; then
    exit 1
fi
xcrun simctl shutdown "$device"
