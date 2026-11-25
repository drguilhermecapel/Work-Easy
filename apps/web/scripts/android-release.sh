#!/usr/bin/env bash
# Build and verify a signed release APK and Play AAB with the owner's existing key.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${APP_VERSION_CODE:?defina um versionCode acima do último publicado}"
: "${APP_VERSION_NAME:?defina o versionName da versão}"
: "${ANDROID_HOME:=${ANDROID_SDK_ROOT:-}}"
: "${ANDROID_HOME:?defina ANDROID_HOME com SDK e build-tools 36.0.0}"
export ANDROID_HOME
APKSIGNER="${ANDROID_HOME}/build-tools/36.0.0/apksigner"
[[ -x "$APKSIGNER" ]] || { echo "Instale Android build-tools 36.0.0"; exit 1; }
[[ "$APP_VERSION_CODE" =~ ^[1-9][0-9]{0,9}$ && "$APP_VERSION_CODE" -le 2100000000 ]]
[[ "$APP_VERSION_NAME" == "$(node -p "require('./package.json').version")" ]]
test -f android/keystore.properties || { echo "Forneça o keystore.properties da chave existente"; exit 1; }
export WORKEASY_RELEASE_TARGET=android VITE_STORE_BUILD=android VITE_ROUTER=hash
export VITE_APP_VERSION="$(git rev-parse HEAD)"

node scripts/release-config.mjs backend
node scripts/check-app-links.mjs --strict --platform android --site-url "$VITE_SITE_URL"
npm run build:native
node scripts/check-bundle-secrets.mjs --dist dist
npm run check:store-bundle -- --store android
npx --no-install cap sync android
(cd android && ./gradlew :app:assembleRelease :app:bundleRelease --no-daemon \
  -PappVersionCode="$APP_VERSION_CODE" -PappVersionName="$APP_VERSION_NAME")

apk=android/app/build/outputs/apk/release/app-release.apk
aab=android/app/build/outputs/bundle/release/app-release.aab
verify_dir="$(mktemp -d)"
trap 'rm -rf "$verify_dir"' EXIT
"$APKSIGNER" verify --print-certs "$apk"
# The APK signer must appear in the app-link file for direct installations.
fingerprint="$("$APKSIGNER" verify --print-certs "$apk" | awk '/certificate SHA-256 digest:/ { print $NF; exit }')"
FINGERPRINT="$fingerprint" node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
const links = JSON.parse(readFileSync('public/.well-known/assetlinks.json', 'utf8'));
const normalize = value => value.replaceAll(':', '').toLowerCase();
if (!process.env.FINGERPRINT || !links.some(link => link.target?.package_name === 'br.com.workeasy' &&
  link.target.sha256_cert_fingerprints.some(value => normalize(value) === normalize(process.env.FINGERPRINT)))) {
  throw new Error('Certificado do APK ausente em assetlinks.json');
}
NODE
LC_ALL=C jarsigner -J-Duser.language=en -J-Duser.country=US -verify "$aab" > "$verify_dir/jarsigner.log"
grep -q '^jar verified\.' "$verify_dir/jarsigner.log"
keytool -printcert -jarfile "$aab" > /dev/null
for package in "$apk" "$aab"; do
  folder="$verify_dir/$(basename "$package")"
  prefix=assets/public
  [[ "$package" == *.aab ]] && prefix=base/assets/public
  unzip -q "$package" "$prefix/*" -d "$folder"
  node scripts/release-config.mjs bundle "$folder/$prefix"
  npm run check:store-bundle -- --store android --dist "$folder/$prefix"
  node scripts/check-bundle-secrets.mjs --dist "$folder/$prefix"
done
shasum -a 256 "$apk" "$aab"
