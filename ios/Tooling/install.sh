#!/bin/zsh
set -euo pipefail
cd "${0:A:h}/.."
device="${1:?Pass the target UDID from xcrun devicectl list devices}"
app="build/DerivedData/Build/Products/Debug-iphoneos/CursedLabyrinth.app"
test -f "$app/Generated/chapter.json"
xcrun devicectl --timeout 30 device install app --device "$device" "$app"
xcrun devicectl --timeout 30 device process launch --device "$device" --terminate-existing com.davislinyd.thecursedlabyrinth
