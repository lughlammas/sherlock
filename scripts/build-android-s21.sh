#!/usr/bin/env bash
# Build Sherlock-0.1.0-s21.apk (arm64-v8a, signed) on the box.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export JAVA_HOME="${JAVA_HOME:-/workspace/tooling/jdk-17.0.20.1+1}"
export PATH="$JAVA_HOME/bin:${PATH:-}"
export ANDROID_HOME="${ANDROID_HOME:-/workspace/tooling/android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"

ENGINE_SO="${ENGINE_SO:-/workspace/lugh-android-out/liblughnasadh.so}"
if [[ ! -f "$ENGINE_SO" ]]; then
  ENGINE_SO="/workspace/lughnasadh-apk-0.2.0/lib/arm64-v8a/liblughnasadh.so"
fi
mkdir -p "$ROOT/android/app/src/main/jniLibs/arm64-v8a"
cp -f "$ENGINE_SO" "$ROOT/android/app/src/main/jniLibs/arm64-v8a/liblughnasadh.so"
chmod 755 "$ROOT/android/app/src/main/jniLibs/arm64-v8a/liblughnasadh.so"

cd "$ROOT"
npm run build
rm -rf "$ROOT/android/app/src/main/assets"
mkdir -p "$ROOT/android/app/src/main/assets"
cp -a "$ROOT/dist/." "$ROOT/android/app/src/main/assets/"

printf 'sdk.dir=%s\n' "$ANDROID_HOME" > "$ROOT/android/local.properties"
cd "$ROOT/android"
./gradlew :app:assembleRelease --no-daemon

OUT="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
cp -f "$OUT" "$ROOT/Sherlock-0.1.0-s21.apk"
cp -f "$OUT" /workspace/Sherlock-0.1.0-s21.apk 2>/dev/null || true
echo "APK: $ROOT/Sherlock-0.1.0-s21.apk"
ls -la "$ROOT/Sherlock-0.1.0-s21.apk"
sha256sum "$ROOT/Sherlock-0.1.0-s21.apk"
