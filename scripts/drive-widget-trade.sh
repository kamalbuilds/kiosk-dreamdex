#!/usr/bin/env bash
# Drive a real trade through the deployed Kiosk widget with a browser wallet.
#
# Rabby renders each approval in chrome-extension://<id>/notification.html, which is a
# real CDP page target, so the whole flow is scriptable: click the widget's action,
# then approve each prompt as it appears. A Kiosk trade raises up to three prompts:
# the collateral allowance the pool pulls escrow with, the user's own placeBinaryOrder
# on the venue pool, and the KioskRouter.route record.
set -uo pipefail

PROFILE=deepsurge
RABBY=acmacodkjbdgmoleebolmdjonilkdbch
EMBED="https://kiosk-dreamdex.vercel.app/embed?code=${1:-kiosk-demo}&asset=${2:-BTC}"

popup_open() {
  bh-multi run "$PROFILE" "
r = cdp('Target.getTargets', {})
print('YES' if any('notification.html' in (t.get('url') or '') for t in r.get('targetInfos', [])) else 'NO')
" 2>/dev/null | tail -1
}

approve_one() {
  bhn "$PROFILE" use "chrome-extension://$RABBY/notification.html" >/dev/null 2>&1
  sleep 2
  for label in Confirm Sign Approve Continue "Sign and Send"; do
    if bhn "$PROFILE" click "$label" >/dev/null 2>&1; then
      echo "    approved via: $label"
      return 0
    fi
  done
  echo "    no approve button found"
  return 1
}

echo "widget: $EMBED"
bhn "$PROFILE" use "$EMBED" >/dev/null 2>&1
sleep 2

ACTION=$(bhn "$PROFILE" eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/^Buy /.test(x.textContent||'')); if(!b) return 'NO_ACTION'; b.click(); return b.textContent.trim();})()" 2>/dev/null)
echo "clicked: $ACTION"

for round in 1 2 3 4 5 6; do
  found=""
  for _ in 1 2 3 4 5 6 7 8; do
    sleep 2
    if [ "$(popup_open)" = "YES" ]; then found=1; break; fi
  done
  if [ -z "$found" ]; then
    echo "round $round: no further prompt"
    break
  fi
  echo "round $round: prompt open"
  approve_one
  sleep 3
done

bhn "$PROFILE" use "$EMBED" >/dev/null 2>&1
sleep 3
echo "--- widget state ---"
bhn "$PROFILE" text 2>/dev/null | /usr/bin/python3 -c "import sys,json; print(json.load(sys.stdin)['text'][-700:])"
