#!/usr/bin/env python3
"""Render the demo's title and end cards.

This ffmpeg build has no drawtext filter (compiled without freetype), so the cards are
drawn with PIL and handed to ffmpeg as stills. Colours match the product's own system:
enamel black, sodium amber, bone text.
"""

import pathlib

from PIL import Image, ImageDraw, ImageFont

W, H = 1920, 1080
INK = (7, 12, 10)
AMBER = (245, 165, 36)
BONE = (232, 228, 220)
MUTED = (138, 143, 136)
MONO = "/System/Library/Fonts/Supplemental/Andale Mono.ttf"
OUT = pathlib.Path("/tmp/kioskcards")
OUT.mkdir(exist_ok=True)


def font(size):
    return ImageFont.truetype(MONO, size)


def centred(d, text, f, y, fill):
    box = d.textbbox((0, 0), text, font=f)
    d.text(((W - (box[2] - box[0])) / 2, y), text, font=f, fill=fill)


def card(name, big, big_size, lines):
    img = Image.new("RGB", (W, H), INK)
    d = ImageDraw.Draw(img)
    # A single sodium dot, the same mark the product uses.
    d.ellipse([(W / 2 - 7, 250), (W / 2 + 7, 264)], fill=AMBER)
    centred(d, big, font(big_size), 360, AMBER)
    y = 520
    for text, size, fill in lines:
        centred(d, text, font(size), y, fill)
        y += size + 26
    p = OUT / (name + ".png")
    img.save(p)
    print("  %s %dx%d" % (p, W, H))


card(
    "title", "KIOSK", 96,
    [
        ("One script tag. Any page becomes a prediction market.", 40, BONE),
        ("The page owner gets paid for the order flow.", 40, BONE),
        ("Somnia x DreamDEX Event Contracts", 30, MUTED),
    ],
)

card(
    "end", "kiosk-dreamdex.vercel.app", 56,
    [
        ("KioskRouter", 30, MUTED),
        ("0x57ED83B351eDe66b2cb9C0dDa1F2247E1Cc62Be7", 34, BONE),
        ("Somnia Shannon  .  chain 50312", 30, MUTED),
        ("25 bps of routed notional, 13 of them to the host", 34, BONE),
    ],
)
print("cards rendered")
