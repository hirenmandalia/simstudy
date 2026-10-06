#!/bin/sh
# Renders the fictional Pantry Pal mock to PNG screenshots with headless Chrome
# (a throwaway profile, never your own). Output: demo/screens/S<n>-<name>.png
set -e
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for pair in 1:home 2:recipe-detail 3:save-sheet 4:profile-collections 5:new-collection; do
  n="${pair%%:*}"; label="${pair#*:}"; out="screens/S$n-$label.png"
  rm -f "$out"
  PROFILE="$(mktemp -d)"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run --user-data-dir="$PROFILE" \
    --force-device-scale-factor=2 --window-size=390,844 \
    --screenshot="$out" "file://$PWD/pantry-pal-mock.html?s=$n" >/dev/null 2>&1 &
  pid=$!
  # Headless Chrome sometimes lingers after writing the file; stop it once the PNG exists.
  i=0; while [ ! -s "$out" ] && [ $i -lt 40 ]; do sleep 0.5; i=$((i+1)); done
  sleep 0.5; kill $pid 2>/dev/null || true; wait $pid 2>/dev/null || true
  rm -rf "$PROFILE"
done
ls -la screens
