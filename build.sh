#!/usr/bin/env bash
# Builds web/ (the pet) and the Swift app, then assembles build/VoicePet.app
#
#   ./build.sh                  native architecture
#   ARCH=amd64 ./build.sh       Intel (x86_64) build; works on Apple Silicon too (cross-compiles)
#   ARCH=arm64 ./build.sh       Apple Silicon build
#   AVATAR=frog ./build.sh      pick the avatar (default comes from web/avatar.config.js)
set -euo pipefail
cd "$(dirname "$0")"

ARCH="${ARCH:-}"
case "$ARCH" in
  "") ;;
  amd64|x86_64|intel) ARCH=x86_64 ;;
  arm64|aarch64) ARCH=arm64 ;;
  *) echo "error: unknown ARCH '$ARCH' (use amd64 or arm64)" >&2; exit 1 ;;
esac
SWIFT_ARGS=(-c release)
if [ -n "$ARCH" ]; then
  export VOICEPET_ARCH="$ARCH"                       # read by Package.swift
  SWIFT_ARGS+=(--arch "$ARCH" --manifest-cache none)  # re-evaluate the manifest for the target arch
fi

(cd web && npm run build --silent)
swift build "${SWIFT_ARGS[@]}"
BIN_DIR="$(swift build "${SWIFT_ARGS[@]}" --show-bin-path)"
BIN="$BIN_DIR/VoicePet"
if [ ! -x "$BIN" ]; then
  echo "error: Swift build completed without producing $BIN" >&2
  exit 1
fi
APP=build/VoicePet.app
STAGING=build/VoicePet.app.staging
rm -rf "$STAGING"
trap 'rm -rf "$STAGING"' EXIT
mkdir -p "$STAGING/Contents/MacOS" "$STAGING/Contents/Resources/web"
cp Resources/Info.plist "$STAGING/Contents/"
cp "$BIN" "$STAGING/Contents/MacOS/"
cp -R web/dist/. "$STAGING/Contents/Resources/web/"
# binary frameworks from dependencies (llama.cpp for the on-device brain)
mkdir -p "$STAGING/Contents/Frameworks"
for fw in $(find .build -type d -name "*.framework" -path "*macos*" 2>/dev/null; find .build/artifacts -type d -name "*.framework" 2>/dev/null); do
  name=$(basename "$fw"); [ -d "$STAGING/Contents/Frameworks/$name" ] || cp -R "$fw" "$STAGING/Contents/Frameworks/"
done
install_name_tool -add_rpath "@executable_path/../Frameworks" "$STAGING/Contents/MacOS/VoicePet" 2>/dev/null || true
# SwiftPM resource bundles from dependencies, if any
for b in "$BIN_DIR"/*.bundle; do
  if [ -d "$b" ]; then cp -R "$b" "$STAGING/Contents/Resources/"; fi
done
# Sign with the stable local identity if it exists (keeps macOS permission grants across rebuilds), else ad-hoc.
if security find-identity -v -p codesigning 2>/dev/null | grep -q "VoicePet Dev"; then
  codesign --force --deep --sign "VoicePet Dev" "$STAGING" && echo "signed with VoicePet Dev"
else
  codesign --force --deep --sign - "$STAGING" && echo "signed ad-hoc (permissions may reset on rebuild)"
fi
rm -rf "$APP"
mv "$STAGING" "$APP"
trap - EXIT
echo "Built $APP ($(lipo -archs "$APP/Contents/MacOS/VoicePet" 2>/dev/null || echo unknown arch))"
