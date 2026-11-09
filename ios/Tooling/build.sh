#!/bin/zsh
set -euo pipefail
cd "${0:A:h}/.."
mkdir -p build .cache
node Tooling/export-data.mjs
node Tooling/export-art.mjs
node Tooling/validate-art.mjs
.venv/bin/python Tooling/prepare-assets.py
swift test --scratch-path build/swift
xcodegen generate --spec project.yml --project .
xcodebuild -project CursedLabyrinth.xcodeproj -scheme CursedLabyrinth \
  -configuration Debug -destination 'generic/platform=iOS' \
  -derivedDataPath build/DerivedData -allowProvisioningUpdates build
test -f build/DerivedData/Build/Products/Debug-iphoneos/CursedLabyrinth.app/Generated/chapter.json
