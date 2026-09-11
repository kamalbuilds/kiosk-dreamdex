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
    ("00", "Kiosk. One script tag turns any page into a prediction market, and pays the page owner "
           "for the order flow."),
    ("07", "Kiosk is live on Somnia Shannon. The router address is on screen, the code is public, and "
           "every number in this video was read back from the chain, not from our own database."),
    ("01", "Every order on a DreamDEX event contract carries two arguments almost nobody looks at. "
           "An address called builder, and a fee for that builder. The venue is willing to pay whoever "
           "brings it order flow. I read that cap on chain. On Shannon, and on mainnet, it is zero. "
           "The seat exists, and nobody is sitting in it."),
    ("02", "Eighty three and a half percent of DreamDEX markets never see a single trade. That is not a "
           "pricing problem. The person with an opinion, and the venue where that opinion pays out, are "
           "never in the same room. Ninety five projects were built for this venue. Almost every one of "
           "them is a place you have to go to."),
    ("03", "Kiosk goes the other way. This is a newsletter. Static HTML on a disk. No bundler, no framework, "
           "no stylesheet shared with us. One script tag, and the market sits in the middle of the argument. "
           "The odds come from the live order book. The countdown is the real window expiry."),
    ("04", "The reader picks a side and signs it themselves, against DreamDEX's own pool. Kiosk never holds "
           "the position. The allowance, the order on the venue, then the routing record. Order placed and "
           "routed. Four point three eight tUSDC of notional, and the host just earned twenty five basis "
           "points of it."),
    ("05", "The host reads that from the router contract, not from our database. On chain the router went "
           "from five orders to six, and the host payout wallet rose by exactly the share the widget quoted "
           "before the click. Thirty nine contract tests, and five deliberate bugs, each one confirmed to "
           "turn those tests red."),
    ("06", "We charge our own fee today because the venue's is switched off. The day DreamDEX raises that "
           "cap, the same address is already threaded through as the builder, and the venue pays the host "
           "directly. Prediction markets do not need another terminal. They need to be where the argument "
           "already is."),
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
