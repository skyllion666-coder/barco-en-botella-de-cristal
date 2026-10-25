#!/bin/bash
# Copia la web (docs/) dentro de la app y genera el APK firmado con release.keystore.
set -e
cd "$(dirname "$0")"
rm -rf app/src/main/assets/www && mkdir -p app/src/main/assets/www
cp -r ../docs/. app/src/main/assets/www/
V=$(python3 -c "import json;print(json.load(open('../docs/version.json'))['version'])")
sed -i "s/versionCode = .*/versionCode = $V/; s/versionName = .*/versionName = \"$V\"/" app/build.gradle.kts
./gradlew assembleRelease --no-daemon -q
mkdir -p ../releases
cp app/build/outputs/apk/release/app-release.apk "../releases/Barco-en-la-botella-v$V.apk"
ls -l "../releases/Barco-en-la-botella-v$V.apk"
