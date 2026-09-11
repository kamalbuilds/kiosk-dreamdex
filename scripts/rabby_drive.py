#!/usr/bin/env python3
"""Confirm each Rabby prompt with a real cursor click, located via CDP geometry."""
import subprocess
import sys
import time

import Quartz

HARNESS = "/Users/kamal/Developer/browser-harness"
PROBE = "/Users/kamal/Desktop/dorahacks/somnia/kiosk/scripts/rabby_probe.py"


def rabby_window():
    wl = Quartz.CGWindowListCopyWindowInfo(
        Quartz.kCGWindowListOptionOnScreenOnly | Quartz.kCGWindowListExcludeDesktopElements,
        Quartz.kCGNullWindowID)
    for w in wl:
        if w.get('kCGWindowLayer') != 0:
            continue
        n = w.get('kCGWindowName') or ''
        if 'Rabby' in n or 'Notification' in n:
            b = w['kCGWindowBounds']
            return (int(b['X']), int(b['Y']), int(b['Width']), int(b['Height']))
    return None


def probe():
    r = subprocess.run(["bh-multi", "run", "deepsurge", "exec(open('%s').read())" % PROBE],
                       cwd=HARNESS, capture_output=True, text=True, timeout=60)
    for line in r.stdout.splitlines():
        if line.startswith("OK "):
            parts = line.split()
            off = parts[1].split(',')
            rect = parts[2].split(',')
            if rect[0] == 'none':
                return None
            iw, ih, sx, sy, oh = (int(float(v)) for v in off[:5])
            chrome = oh - ih
            return (sx + int(rect[0]), sy + chrome + int(rect[1]), rect[2] == '1', rect[3])
    return None


def glide(bx, by, dur=1.0):
    e = Quartz.CGEventCreate(None)
    p = Quartz.CGEventGetLocation(e)
    ax, ay = int(p.x), int(p.y)
    steps = max(2, int(dur * 60))
    for s in range(1, steps + 1):
        t = s / steps
        t = t * t * (3 - 2 * t)
        subprocess.run(["cliclick", "m:%d,%d" % (ax + (bx - ax) * t, ay + (by - ay) * t)],
                       stdout=subprocess.DEVNULL)
        time.sleep(dur / steps)


def raise_page():
    subprocess.run(["osascript", "-e",
                    'tell application "System Events" to tell (first process whose unix id is 20074) to set frontmost to true'],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def main():
    rounds = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    for i in range(rounds):
        deadline = time.time() + 35
        while time.time() < deadline and not rabby_window():
            time.sleep(0.3)
        if not rabby_window():
            print("round %d: no rabby window" % i, flush=True)
            return
        print("round %d: window up" % i, flush=True)
        time.sleep(1.0)
        info = None
        armed = time.time() + 45
        while time.time() < armed:
            info = probe()
            if info and info[2]:
                break
            time.sleep(1.0)
        if not (info and info[2]):
            print("round %d: never armed %s" % (i, info), flush=True)
            return
        x, y, _, label = info
        time.sleep(2.0)
        glide(x, y, 1.1)
        time.sleep(0.6)
        subprocess.run(["cliclick", "c:%d,%d" % (x, y)], stdout=subprocess.DEVNULL)
        print("round %d: clicked %s at %d,%d" % (i, label, x, y), flush=True)
        t = time.time() + 20
        while time.time() < t and rabby_window():
            time.sleep(0.3)
        raise_page()
        time.sleep(1.5)
    print("done", flush=True)


main()
