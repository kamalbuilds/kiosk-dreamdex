#!/bin/zsh
D=/Users/kamal/Desktop/dorahacks/somnia/kiosk/scripts
PY=/opt/homebrew/bin/python3
mkdir -p /tmp/shots
osascript -e 'tell application "System Events" to set visible of (first process whose unix id is 3705) to false' >/dev/null 2>&1
osascript -e 'tell application "System Events" to tell (first process whose unix id is 20074) to set frontmost to true' >/dev/null 2>&1
sleep 1.0
cliclick m:980,620
sleep 0.6
screencapture -v -V 100 -C -R 0,33,1470,923 /tmp/shots/trade-raw.mov >/dev/null 2>&1 &
CAP=$!
sleep 2.5
$PY $D/cursor-glide.py 1800 980,620 800,500 660,450 637,435
$PY - <<'EOF'
import Quartz, time, subprocess
def rb():
    wl=Quartz.CGWindowListCopyWindowInfo(Quartz.kCGWindowListOptionOnScreenOnly|Quartz.kCGWindowListExcludeDesktopElements,Quartz.kCGNullWindowID)
    return any('Rabby' in (w.get('kCGWindowName') or '') for w in wl)
ys=[435,378,435,378,435,378,435,378]
for y in ys:
    if rb(): break
    subprocess.run(['cliclick','m:637,%d'%y]); time.sleep(0.25)
    subprocess.run(['cliclick','c:637,%d'%y])
    print('click',y, flush=True)
    t=time.time()+3.5
    while time.time()<t and not rb():
        time.sleep(0.3)
print('rabby', rb(), flush=True)
EOF
$PY $D/rabby_drive.py 3
echo "driver done"
sleep 8
kill -INT $CAP 2>/dev/null
wait $CAP 2>/dev/null
echo captured
