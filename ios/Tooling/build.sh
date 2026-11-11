#!/bin/zsh
set -euo pipefail
cd "${0:A:h}/.."
mkdir -p build .cache
if [[ ! -f ArtSource/export/rotroot.glb || ! -f ArtSource/export/rotroot_wraith.glb || ArtSource/colossus_horror.py -nt ArtSource/export/rotroot.glb || ArtSource/horror_sculpt.py -nt ArtSource/export/rotroot.glb || ArtSource/Textures/ashen-hide-v1.png -nt ArtSource/export/rotroot.glb || ! -f ArtSource/export/scene_boss.glb ]]; then
  "${BLENDER_BIN:-/Applications/Blender.app/Contents/MacOS/Blender}" --background --python ArtSource/colossus_horror.py
fi
node Tooling/export-data.mjs
node Tooling/export-art.mjs
node Tooling/validate-art.mjs
python3 Tooling/prepare-atmosphere.py
.venv/bin/python Tooling/prepare-assets.py
swift test --scratch-path build/swift
xcodegen generate --spec project.yml --project .
xcodebuild -project CursedLabyrinth.xcodeproj -scheme CursedLabyrinth \
  -configuration Debug -destination 'generic/platform=iOS' \
  -derivedDataPath build/DerivedData -allowProvisioningUpdates build
test -f build/DerivedData/Build/Products/Debug-iphoneos/CursedLabyrinth.app/Generated/chapter.json
