#!/bin/zsh
D=/Users/kamal/Desktop/dorahacks/somnia/kiosk/scripts
PY=/opt/homebrew/bin/python3
mkdir -p /tmp/shots
osascript -e 'tell application "System Events" to tell (first process whose unix id is 20074) to set frontmost to true' >/dev/null 2>&1
cliclick m:800,300
sleep 0.5
screencapture -v -V 26 -C -l 5667 /tmp/shots/dashboard.mov >/dev/null 2>&1 &
CAP=$!
sleep 1.0
bhn deepsurge use ADE5BBB0BB81F39035C51FC0B68F2D36 >/dev/null 2>&1
bhn deepsurge eval --file /tmp/tl_dash.js >/dev/null 2>&1
sleep 2.6
$PY $D/cursor-glide.py 6000 800,300 700,420 620,520 &
sleep 6.3
$PY $D/cursor-glide.py 6000 620,520 900,430 1000,560 &
sleep 6.3
$PY $D/cursor-glide.py 5500 1000,560 760,470 700,380 &
wait $CAP
echo captured
