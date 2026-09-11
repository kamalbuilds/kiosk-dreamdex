#!/usr/bin/env python3
"""Render the demo narration to six audio segments via the ElevenLabs REST API.

Uses the REST endpoint directly rather than the SDK so there is nothing to install.
The key is read from the environment and never printed.

  python3 scripts/narrate.py
"""

import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

KEY = os.getenv("ELEVENLABS_API_KEY") or os.getenv("ELEVEN_LABS_API_KEY")
if not KEY:
    sys.exit("No ElevenLabs key in the environment. Set ELEVEN_LABS_API_KEY.")

VOICE = os.getenv("ELEVEN_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")
MODEL = "eleven_multilingual_v2"
OUT = pathlib.Path("/tmp/kioskaudio")
OUT.mkdir(exist_ok=True)

SEGMENTS = [
    ("v1", "A prediction market only works if somebody takes the other side. On DreamDEX, most "
           "markets never see a single trade. Not because the odds are wrong, but because the "
           "people with an opinion are somewhere else. In a newsletter, a group chat, a comment "
           "thread. The market is on the exchange. The argument is everywhere else."),
    ("v2", "Kiosk is one line of HTML that puts the market inside the argument. A publisher pastes "
           "a script tag, and a live up or down ticket appears in their page."),
    ("v3", "The odds come straight from the order book. The countdown is the real window closing. "
           "The reader picks a side, sets a size, and signs it with their own wallet, against "
           "DreamDEX's own pool. Kiosk never holds the position."),
    ("v4", "And the page owner gets paid. Twenty five basis points of everything their readers "
           "route, split on chain, thirteen of them to the host. The exchange already wrote this "
           "door into its own function signature. Every order carries a builder address and a fee "
           "for it. Today that fee is set to zero, and nobody is standing there."),
    ("v5", "This is live on Somnia Shannon. A real router contract, real orders against live "
           "pools, and a host wallet whose balance went up by exactly what the ticket quoted "
           "before the click."),
    ("v4b", "Nothing here is a screenshot. The router is a contract on Shannon, and a trade placed "
            "through this widget moved it from five routed orders to six, and moved the host's "
            "wallet by exactly the share the ticket had quoted a moment before the click."),
    ("v5b", "The contracts carry thirty nine tests. Passing was not the bar, so five deliberate bugs "
            "were introduced one at a time, and each one was confirmed to turn the suite red before "
            "being put back. One of them leaked a single unit of dust per order, and the fuzzer "
            "caught it."),
    ("v7", "When DreamDEX turns its own builder fee on, the host's address is already sitting in the "
           "order. The venue starts paying them directly, and nothing in this code has to change. "
           "The market does not need another terminal. It needs to be where the argument already is."),
    ("v6", "One script tag. Kiosk dreamdex dot vercel dot app."),
]


def render(name, text):
    dest = OUT / ("seg%s.mp3" % name)
    body = json.dumps({
        "text": text,
        "model_id": MODEL,
        "voice_settings": {"stability": 0.45, "similarity_boost": 0.75, "style": 0.1, "use_speaker_boost": True},
    }).encode()
    req = urllib.request.Request(
        "https://api.elevenlabs.io/v1/text-to-speech/%s" % VOICE,
        data=body,
        headers={"xi-api-key": KEY, "Content-Type": "application/json", "Accept": "audio/mpeg"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            dest.write_bytes(r.read())
        print("  seg%s %d bytes, %d words" % (name, dest.stat().st_size, len(text.split())))
        return True
    except urllib.error.HTTPError as e:
        detail = e.read()[:200].decode("utf-8", "replace")
        print("  seg%s FAILED http %s: %s" % (name, e.code, detail))
        return False
    except Exception as e:
        print("  seg%s FAILED %s" % (name, str(e)[:120]))
        return False


ok = 0
for name, text in SEGMENTS:
    if render(name, text):
        ok += 1
print("rendered %d/%d segments into %s" % (ok, len(SEGMENTS), OUT))
sys.exit(0 if ok == len(SEGMENTS) else 1)
