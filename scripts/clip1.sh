#!/bin/zsh
D=/Users/kamal/Desktop/dorahacks/somnia/kiosk/scripts
glide() { /usr/bin/python3 $D/cursor-glide.py "$@" }
BX=$D/bx
$BX eval --file /tmp/scroll.js >/dev/null 2>&1
$BX eval "scrollTo(0,0)" >/dev/null 2>&1
cliclick m:760,300
sleep 0.5
PID=$($D/rec.sh embed-reveal 27.5)
sleep 2.2
sleep 1.2
$BX eval "window.__scrollTo(0,360,6000)" >/dev/null 2>&1 &
glide 5500 760,300 700,430 660,520 &
sleep 6.2
$BX eval "window.__scrollTo(360,640,5000)" >/dev/null 2>&1 &
glide 4800 660,520 600,430 520,400 &
sleep 5.2
glide 4000 520,400 820,470 960,600 &
sleep 4.2
$BX eval "window.__scrollTo(640,900,4000)" >/dev/null 2>&1 &
glide 3800 960,600 800,520 700,430 &
sleep 4.2
glide 3000 700,430 640,360 720,300 &
sleep 3.5
while kill -0 $PID 2>/dev/null; do sleep 0.5; done
echo done
