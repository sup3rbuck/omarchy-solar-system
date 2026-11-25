#!/bin/sh
# Pauses a video wallpaper (owe) while the solar system layer is on screen,
# and resumes it once the layer is gone (plugin disabled or shell stopped).
# Only one guard runs at a time.
exec 9>"${XDG_RUNTIME_DIR:-/tmp}/mog-solar-system-video-guard.lock"
flock -n 9 || exit 0

present() { hyprctl layers 2>/dev/null | grep -q mog-solar-system; }

sleep 2
missing=0
ticks=0
while :; do
  if present; then
    missing=0
    # Re-assert every ~30 s, which also covers a newly chosen video.
    [ $((ticks % 10)) -eq 0 ] && owe pause >/dev/null 2>&1
    ticks=$((ticks + 1))
  else
    missing=$((missing + 1))
    # Gone for two checks in a row (not just a hot reload): resume and stop.
    if [ "$missing" -ge 2 ]; then
      owe resume >/dev/null 2>&1
      exit 0
    fi
  fi
  sleep 3
done
