#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
project="$root/android-preview"
sdk="${ANDROID_HOME:?Set ANDROID_HOME to the Android SDK}"
tools="$sdk/build-tools/35.0.0"
platform="$sdk/platforms/android-35/android.jar"
out="${1:?Pass an absolute output APK path}"
[[ "$out" = /* ]] || { echo "Output path must be absolute"; exit 1; }
[[ -n "${TRIPFLIP_SIGN_KEYSTORE:?Set the signing keystore path}" ]]
[[ -n "${TRIPFLIP_SIGN_PASS:?Set the signing password}" ]]
export TRIPFLIP_SIGN_PASS
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cp -r "$project/res" "$tmp/res"
mkdir -p "$tmp/res/drawable" "$tmp/classes" "$tmp/dex"
cp "$root/public/app-icon.png" "$tmp/res/drawable/tripflip_icon.png"
"$tools/aapt2" compile --dir "$tmp/res" -o "$tmp/resources.zip"
"$tools/aapt2" link -I "$platform" --manifest "$project/AndroidManifest.xml" -o "$tmp/unsigned.apk" "$tmp/resources.zip"
javac -source 8 -target 8 -bootclasspath "$platform" -d "$tmp/classes" "$project/src/co/kr/tripflip/preview/MainActivity.java"
"$tools/d8" --lib "$platform" --min-api 24 --output "$tmp/dex" "$tmp/classes"/co/kr/tripflip/preview/*.class
(cd "$tmp/dex" && zip -q "$tmp/unsigned.apk" classes.dex)
"$tools/zipalign" -f 4 "$tmp/unsigned.apk" "$tmp/aligned.apk"
"$tools/apksigner" sign --ks "$TRIPFLIP_SIGN_KEYSTORE" --ks-key-alias tripflip-preview --ks-pass env:TRIPFLIP_SIGN_PASS --min-sdk-version 24 --out "$out" "$tmp/aligned.apk"
"$tools/apksigner" verify --min-sdk-version 24 --verbose "$out"
