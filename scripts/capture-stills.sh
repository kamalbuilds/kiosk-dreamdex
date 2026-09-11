#!/usr/bin/env bash
# Capture the demo as stills of the real deployed product.
#
# Only the page is captured, never the desktop. The harness's in-process scroll() and
# js() helpers block in this runtime, and cdp() only accepts browser-level commands,
# so the page is driven through the bhn CLI and each frame is grabbed with a separate
# bh-multi call. Motion is added later in ffmpeg rather than filmed.
set -uo pipefail

P=deepsurge
OUT=/tmp/kioskstills
mkdir -p "$OUT"

shot() {  # shot <name>
  bh-multi run "$P" "
import shutil
p = capture_screenshot()
shutil.copy(p, '$OUT/$1.png')
" >/dev/null 2>&1
  if [ -f "$OUT/$1.png" ]; then echo "  $1 ok"; else echo "  $1 FAILED"; fi
}

page() {  # page <url> <prefix> <n_scroll_steps> <px_per_step>
  local url="$1" prefix="$2" steps="$3" px="$4"
  echo "$prefix <- $url"
  bhn "$P" goto "$url" >/dev/null 2>&1
  sleep 7
  shot "${prefix}-00"
  for i in $(seq 1 "$steps"); do
    bhn "$P" eval "window.scrollTo({top:$((px * i)),behavior:'instant'}); 'ok'" >/dev/null 2>&1
    sleep 0.7
    shot "$(printf '%s-%02d' "$prefix" "$i")"
  done
  bhn "$P" eval "window.scrollTo({top:0,behavior:'instant'}); 'ok'" >/dev/null 2>&1
}

page "https://kiosk-dreamdex.vercel.app/" landing 9 760
page "http://localhost:4177/" host 6 620
page "https://kiosk-dreamdex.vercel.app/dashboard?code=kiosk-demo" dash 5 520

# The kiosk itself, held still so the countdown visibly moves between frames. This is
# the one segment where real time matters: it proves the widget is reading the chain.
echo "widget live burst"
bhn "$P" goto "https://kiosk-dreamdex.vercel.app/embed?code=kiosk-demo&asset=BTC" >/dev/null 2>&1
sleep 8
for i in $(seq 0 17); do
  shot "$(printf 'widget-%02d' "$i")"
  sleep 1.1
done

echo "stills in $OUT: $(ls "$OUT" | wc -l)"
