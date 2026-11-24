#!/usr/bin/env bash
# Builds the Android App Bundle (.aab) that goes to Google Play, from the web bundle of the store build.
# Procedure and what each step proves: docs/lojas/google-play.md, section 14.4.
#
#   VITE_SUPABASE_URL=https://<ref>.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
#   VITE_SITE_URL=https://<domain> APP_VERSION_CODE=12 APP_VERSION_NAME=1.2.0 \
#   ANDROID_HOME=<sdk> bash scripts/android-release.sh
#
# The .aab is signed only when android/keystore.properties exists (never versioned; it names the upload
# key). Without it the Gradle build leaves the bundle unsigned, and the script says so.
# STRICT_APP_LINKS=1 also fails while the deep-link files still hold a placeholder.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${VITE_SUPABASE_URL:?defina a URL do projeto Supabase (https://...)}"
: "${VITE_SUPABASE_PUBLISHABLE_KEY:?defina a chave publicável (sb_publishable_...)}"
: "${APP_VERSION_CODE:?defina o versionCode (inteiro, maior que o do último envio)}"
: "${APP_VERSION_NAME:?defina o versionName (ex.: 1.2.0)}"
: "${ANDROID_HOME:=${ANDROID_SDK_ROOT:-}}"
: "${ANDROID_HOME:?defina ANDROID_HOME (Android SDK com a plataforma 36)}"
export ANDROID_HOME
case "$VITE_SUPABASE_URL" in https://*) ;; *) echo "A URL do Supabase precisa ser https"; exit 1 ;; esac
case "$VITE_SUPABASE_PUBLISHABLE_KEY" in sb_publishable_*) ;; *) echo "Use a chave publicável (sb_publishable_...)"; exit 1 ;; esac
case "$APP_VERSION_CODE" in '' | *[!0-9]*) echo "APP_VERSION_CODE precisa ser um inteiro"; exit 1 ;; esac

# 1. Web bundle of the store build: no Pro sale, no care line (config/features.ts)
export VITE_STORE_BUILD=android
npm run build:native
node scripts/check-bundle-secrets.mjs --dist dist
node scripts/check-store-bundle.mjs --store android --dist dist
grep -rIlF "$VITE_SUPABASE_URL" dist > /dev/null || { echo "Bundle sem a URL do Supabase: build em modo demonstração"; exit 1; }

# 2. Copy into the Android project, and prove the copy is that bundle
npx cap sync android
node scripts/check-store-bundle.mjs --store android --dist android/app/src/main/assets/public

# 3. Deep links: coherence always; the owner's placeholders only with STRICT_APP_LINKS=1
if [ "${STRICT_APP_LINKS:-0}" = "1" ]; then
  node scripts/check-app-links.mjs --strict --site-url "${VITE_SITE_URL:-}"
else
  node scripts/check-app-links.mjs --site-url "${VITE_SITE_URL:-}"
fi

# 4. The .aab
(cd android && ./gradlew :app:bundleRelease --no-daemon -PappVersionCode="$APP_VERSION_CODE" -PappVersionName="$APP_VERSION_NAME")
AAB=android/app/build/outputs/bundle/release/app-release.aab
test -f "$AAB"
ls -l "$AAB"
sha256sum "$AAB"

# 5. Signature
if jarsigner -verify "$AAB" 2>&1 | grep -q "jar verified"; then
  echo "AAB assinado:"
  keytool -printcert -jarfile "$AAB" | grep -E "Owner|SHA256"
else
  echo "AAB SEM assinatura: crie android/keystore.properties (docs/lojas/google-play.md, 14.3) e rode de novo antes de enviar."
fi
