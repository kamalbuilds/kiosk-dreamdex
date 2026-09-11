#!/bin/zsh
D=/Users/kamal/Desktop/dorahacks/somnia/kiosk/scripts
glide() { /opt/homebrew/bin/python3 $D/cursor-glide.py "$@" }
WID=${WID:-5499}
mkdir -p /tmp/shots
cliclick m:760,300
screencapture -v -V 29 -C -l $WID /tmp/shots/embed-reveal.mov >/dev/null 2>&1 &
CAP=$!
sleep 1.0
bhn deepsurge use 6E59BA3F261DDE8C75A59886544E5D46 >/dev/null 2>&1
bhn deepsurge eval --file /tmp/timeline1.js >/dev/null 2>&1
# page clock starts 3.5s after this returns; cursor follows
sleep 3.0
glide 6000 760,300 700,430 650,540 &
sleep 6.3
glide 5000 650,540 600,430 520,400 &
sleep 5.2
glide 3500 520,400 830,470 960,600 &
sleep 3.6
glide 4500 960,600 800,520 700,430 &
sleep 4.6
glide 4000 700,430 640,360 730,300 &
wait $CAP
echo captured
