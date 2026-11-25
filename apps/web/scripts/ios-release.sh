#!/usr/bin/env bash
# Uses distribution identity and provisioning already available in Xcode/keychain.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${APPLE_TEAM_ID:?defina o Team ID da conta proprietária}"
: "${IOS_BUILD_NUMBER:?defina um número de build acima do último enviado}"
: "${IOS_EXPORT_OPTIONS_PLIST:?forneça o caminho absoluto do plist de exportação App Store Connect}"
[[ "$APPLE_TEAM_ID" =~ ^[A-Z0-9]{10}$ && "$IOS_BUILD_NUMBER" =~ ^[1-9][0-9]*$ ]]
[[ "$IOS_EXPORT_OPTIONS_PLIST" == /* && -r "$IOS_EXPORT_OPTIONS_PLIST" ]]
test "$(/usr/libexec/PlistBuddy -c 'Print :method' "$IOS_EXPORT_OPTIONS_PLIST")" = app-store-connect
[[ "$(/usr/libexec/PlistBuddy -c 'Print :teamID' "$IOS_EXPORT_OPTIONS_PLIST")" == "$APPLE_TEAM_ID" ]]
sdk_version="$(xcrun --sdk iphoneos --show-sdk-version)"
[[ "${sdk_version%%.*}" -ge 26 ]] || { echo "Use Xcode com o SDK iOS 26 ou posterior"; exit 1; }
version="$(node -p "require('./package.json').version")"
export WORKEASY_RELEASE_TARGET=ios VITE_STORE_BUILD=ios VITE_ROUTER=hash
export VITE_APP_VERSION="$(git rev-parse HEAD)"

node scripts/release-config.mjs backend
node scripts/check-app-links.mjs --strict --platform ios --site-url "$VITE_SITE_URL"
APPLE_TEAM_ID="$APPLE_TEAM_ID" node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
const association = JSON.parse(readFileSync('public/.well-known/apple-app-site-association', 'utf8'));
if (!association.applinks.details.some(entry => entry.appID === `${process.env.APPLE_TEAM_ID}.br.com.workeasy`)) {
  throw new Error('Team ID ausente em apple-app-site-association');
}
NODE
npm run build:native
npm run check:store-bundle -- --store ios
node scripts/check-bundle-secrets.mjs --dist dist
npx --no-install cap sync ios
mkdir -p ios/build
output="$(mktemp -d "$PWD/ios/build/release.XXXXXX")"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$output/WorkEasy.xcarchive" \
  DEVELOPMENT_TEAM="$APPLE_TEAM_ID" MARKETING_VERSION="$version" \
  CURRENT_PROJECT_VERSION="$IOS_BUILD_NUMBER" archive
xcodebuild -exportArchive -archivePath "$output/WorkEasy.xcarchive" \
  -exportPath "$output/export" -exportOptionsPlist "$IOS_EXPORT_OPTIONS_PLIST"
set -- "$output/export/"*.ipa
[[ "$#" == 1 && -f "$1" ]]
ipa="$1"
verify_dir="$(mktemp -d)"
trap 'rm -rf "$verify_dir"' EXIT
unzip -q "$ipa" -d "$verify_dir"
set -- "$verify_dir/Payload/"*.app
[[ "$#" == 1 && -d "$1" ]]
app="$1"
codesign --verify --deep --strict "$app"
plutil -lint "$app/PrivacyInfo.xcprivacy"
codesign -d --entitlements :- "$app" > "$verify_dir/entitlements.plist"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :application-identifier' "$verify_dir/entitlements.plist")" == "$APPLE_TEAM_ID.br.com.workeasy" ]]
lipo -verify_arch arm64 "$app/$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$app/Info.plist")"
node scripts/release-config.mjs bundle "$app/public"
npm run check:store-bundle -- --store ios --dist "$app/public"
node scripts/check-bundle-secrets.mjs --dist "$app/public"
shasum -a 256 "$ipa"
