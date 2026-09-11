#!/usr/bin/env python3
"""Glide the real mouse cursor along a path with cliclick. Args: dur_ms x1,y1 x2,y2 [x3,y3 ...]"""
import subprocess
import sys
import time


def ease(p):
    return p * p * (3 - 2 * p)


def main():
    dur = float(sys.argv[1]) / 1000.0
    pts = [tuple(int(v) for v in a.split(",")) for a in sys.argv[2:]]
    legs = len(pts) - 1
    if legs < 1:
        return
    per = dur / legs
    for i in range(legs):
        ax, ay = pts[i]
        bx, by = pts[i + 1]
        steps = max(2, int(per * 60))
        for s in range(1, steps + 1):
            p = ease(s / steps)
            subprocess.run(["cliclick", "m:%d,%d" % (ax + (bx - ax) * p, ay + (by - ay) * p)],
                           stdout=subprocess.DEVNULL)
            time.sleep(per / steps)


main()
