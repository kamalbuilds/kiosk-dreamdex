#!/usr/bin/env python3
"""Locate the widget's orange Buy button on screen. Prints 'x y' in screen points."""
import subprocess
import sys
import tempfile

import Quartz


def main():
    rx, ry, rw, rh = 0, 33, 1470, 923
    path = tempfile.mktemp(suffix=".png")
    subprocess.run(["screencapture", "-x", "-R", "%d,%d,%d,%d" % (rx, ry, rw, rh), path], check=True)
    src = Quartz.CGImageSourceCreateWithURL(
        Quartz.CFURLCreateFromFileSystemRepresentation(None, path.encode(), len(path), False), None)
    img = Quartz.CGImageSourceCreateImageAtIndex(src, 0, None)
    w = Quartz.CGImageGetWidth(img)
    h = Quartz.CGImageGetHeight(img)
    prov = Quartz.CGImageGetDataProvider(img)
    data = Quartz.CGDataProviderCopyData(prov)
    bpr = Quartz.CGImageGetBytesPerRow(img)
    buf = bytes(data)
    best = None
    for y in range(240, h, 4):
        row = y * bpr
        run = 0
        start = 0
        for x in range(0, w, 4):
            o = row + x * 4
            b, g, r = buf[o], buf[o + 1], buf[o + 2]
            if r > 200 and 130 < g < 215 and b < 130:
                if run == 0:
                    start = x
                run += 4
            else:
                if run > 400 and (best is None or run > best[0]):
                    best = (run, start + run // 2, y)
                run = 0
        if run > 400 and (best is None or run > best[0]):
            best = (run, start + run // 2, y)
    if not best:
        print("NONE")
        return 1
    _, cx, cy = best
    sx = rx + cx * rw / w
    sy = ry + cy * rh / h
    print("%d %d" % (sx, sy))
    return 0


sys.exit(main())
