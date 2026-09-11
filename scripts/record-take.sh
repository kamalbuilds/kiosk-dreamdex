#!/usr/bin/env bash
# Record the Kiosk demo with Recordly, driving a real OS cursor.
#
# Why cliclick and not CDP clicks: Recordly's auto-zoom and cursor polish follow the
# real cursor via its telemetry. A CDP-dispatched click moves nothing on screen, so
# the edit would have no motion to track. The page is therefore driven with cliclick
# at real screen coordinates, and only the Rabby approval window is clicked through
# bhn, because it is a separate target whose geometry is not exposed to the page. The
# approval is still fully on camera, which is the shot that was missing before.
set -uo pipefail

P=deepsurge
EMBED="https://kiosk-dreamdex.vercel.app/embed?code=kiosk-demo&asset=BTC"
HOST="http://localhost:4177/"
DASH="https://kiosk-dreamdex.vercel.app/dashboard?code=kiosk-demo"

geom() { bhn "$P" eval "JSON.stringify({sx:window.screenX,sy:window.screenY,oh:window.outerHeight,ih:window.innerHeight})" 2>/dev/null; }

# Page point to screen point. Horizontal chrome is zero; vertical is outer minus inner.
SX=0; SY=0; OFF=0
refresh_geom() {
  local g
  g=$(geom)
  SX=$(echo "$g" | /usr/bin/python3 -c "import sys,json;d=json.loads(json.load(sys.stdin)['value']);print(d['sx'])")
  SY=$(echo "$g" | /usr/bin/python3 -c "import sys,json;d=json.loads(json.load(sys.stdin)['value']);print(d['sy'])")
  OFF=$(echo "$g" | /usr/bin/python3 -c "import sys,json;d=json.loads(json.load(sys.stdin)['value']);print(d['oh']-d['ih'])")
}

# Move the cursor in a few steps so the recorder sees travel, not a teleport.
glide() {  # glide <screenX> <screenY>
  cliclick -e 220 "m:$1,$2" >/dev/null 2>&1
}

click_text() {  # click_text <button name substring>
  local want="$1" coords
  coords=$(bhn "$P" state full 2>/dev/null | /usr/bin/python3 -c "
import sys, json
want = sys.argv[1].lower()
s = json.load(sys.stdin); s = s.get('state', s)
for e in s.get('elements', []):
    if e.get('tag') == 'button' and want in (e.get('name') or '').lower() and e.get('box'):
        x, y, w, h = e['box']
        print('%d,%d' % (round(x + w / 2), round(y + h / 2)))
        break
else:
    print('none')
" "$want")
  [ "$coords" = "none" ] && { echo "  no button matching '$want'"; return 1; }
  local px=${coords%,*} py=${coords#*,}
  local scx=$((SX + px)) scy=$((SY + OFF + py))
  glide "$scx" "$scy"
  sleep 0.6
  cliclick "c:$scx,$scy" >/dev/null 2>&1
  echo "  clicked '$want' at screen $scx,$scy"
  return 0
}

popup_open() {
  bh-multi run "$P" "
r = cdp('Target.getTargets', {})
print('YES' if any('notification.html' in (t.get('url') or '') for t in r.get('targetInfos', [])) else 'NO')
" 2>/dev/null | tail -1
}

approve() {
  bhn "$P" use "chrome-extension://acmacodkjbdgmoleebolmdjonilkdbch/notification.html" >/dev/null 2>&1
  sleep 2.2
  for label in Confirm Sign Approve Continue; do
    if bhn "$P" click "$label" >/dev/null 2>&1; then echo "  approved: $label"; return 0; fi
  done
  echo "  no approve control"; return 1
}

echo "== staging =="
bhn "$P" goto "$HOST" >/dev/null 2>&1
sleep 7
refresh_geom
echo "  origin $SX,$SY chrome offset $OFF"

echo "== recording starts =="
recordly api startNativeScreenRecording '{"sourceId":"screen:1:0"}' >/dev/null 2>&1 \
  || recordly api startNativeScreenRecording >/dev/null 2>&1
sleep 3

# 1. The host page: a static newsletter with the kiosk planted in the article.
bhn "$P" eval "window.scrollTo({top:640,behavior:'smooth'});'ok'" >/dev/null 2>&1
sleep 3

# 2. The kiosk itself.
bhn "$P" goto "$EMBED" >/dev/null 2>&1
sleep 7
refresh_geom
click_text "25"
sleep 2
click_text "up"
sleep 2

# 3. The trade, with every wallet prompt on camera.
click_text "Buy"
for round in 1 2 3; do
  found=""
  for _ in 1 2 3 4 5 6 7 8; do
    sleep 2
    if [ "$(popup_open)" = "YES" ]; then found=1; break; fi
  done
  [ -z "$found" ] && { echo "  round $round: no prompt"; break; }
  approve
  sleep 3
  bhn "$P" use "$EMBED" >/dev/null 2>&1
  sleep 2
done
sleep 6

# 4. The money landing, read from the router contract.
bhn "$P" goto "$DASH" >/dev/null 2>&1
sleep 9
bhn "$P" eval "window.scrollTo({top:520,behavior:'smooth'});'ok'" >/dev/null 2>&1
sleep 5

echo "== recording stops =="
recordly api stopNativeScreenRecording >/dev/null 2>&1
sleep 4
recordly api getRecordedVideoPath 2>&1 | tail -4
recordly recordings 2>&1 | tail -8
