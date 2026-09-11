#!/bin/zsh
D=/Users/kamal/Desktop/dorahacks/somnia/kiosk/scripts
PY=/opt/homebrew/bin/python3
mkdir -p /tmp/shots
osascript -e 'tell application "System Events" to tell (first process whose unix id is 20074) to set frontmost to true' >/dev/null 2>&1
cliclick m:980,620
sleep 0.8
screencapture -v -V 115 -C -R 0,33,1470,923 /tmp/shots/trade-raw.mov >/dev/null 2>&1 &
CAP=$!
sleep 2.5
$PY $D/cursor-glide.py 2000 980,620 800,500 660,400 636,378
sleep 0.8
cliclick c:636,378
echo "clicked buy"
$PY $D/rabby_drive.py 3
echo "driver done"
sleep 9
kill -INT $CAP 2>/dev/null
wait $CAP 2>/dev/null
echo captured
