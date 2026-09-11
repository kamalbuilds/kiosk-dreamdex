"""Capture the Kiosk demo as browser frames.

Runs inside the browser-harness runtime via `bh-multi run deepsurge`, so the only
thing recorded is the page itself. Nothing else on the machine is captured.

Frames land in /tmp/kioskframes/<segment>/ at roughly 11fps and are assembled by
scripts/build-demo-video.sh. Every frame is of the real deployed product against live
Shannon markets; nothing here is staged or mocked.

Usage:  bh-multi run deepsurge "exec(open('scripts/capture-demo.py').read())"
"""

import os
import shutil
import time

ROOT = "/tmp/kioskframes"
PROD = "https://kiosk-dreamdex.vercel.app"
STATIC = "http://localhost:4177/"


class Segment:
    """Captures frames into its own directory while the page is driven."""

    def __init__(self, name):
        self.dir = os.path.join(ROOT, name)
        shutil.rmtree(self.dir, ignore_errors=True)
        os.makedirs(self.dir, exist_ok=True)
        self.n = 0
        self.name = name

    def grab(self, count=1, gap=0.0):
        for _ in range(count):
            try:
                p = capture_screenshot()  # noqa: F821, provided by the harness
                shutil.copy(p, os.path.join(self.dir, "f%04d.png" % self.n))
                self.n += 1
            except Exception as e:
                print("  grab failed:", str(e)[:60])
            if gap:
                time.sleep(gap)

    def hold(self, seconds):
        """Keep filming a live page so countdowns and books actually move."""
        end = time.time() + seconds
        while time.time() < end:
            self.grab(1)

    def done(self):
        print("  %s: %d frames" % (self.name, self.n))


def scroll_through(seg, steps, px, pause=0.05):
    """scroll(x, y) is the harness's native scroll. js() blocks in this runtime and
    must not be used here, it stalls the capture."""
    for i in range(steps):
        scroll(0, px * (i + 1))  # noqa: F821
        time.sleep(pause)
        seg.grab(2)


print("capturing demo frames")

# 1. The pitch. Scroll the landing page so the argument reads in order.
goto_url(PROD)  # noqa: F821
time.sleep(6)
s = Segment("01-landing")
s.grab(8, 0.08)
scroll_through(s, 26, 420)
s.done()

# 2. The static third-party host. No build step, no framework, no shared CSS.
#    This is the claim the whole product rests on, so it is filmed on a real page
#    served from a different origin.
goto_url(STATIC)  # noqa: F821
time.sleep(7)
s = Segment("02-host-page")
s.grab(8, 0.08)
scroll_through(s, 14, 380)
s.hold(4)
s.done()

# 3. The kiosk itself, live. Held long enough that the countdown visibly ticks and
#    the book refreshes, which is the proof it is reading the chain and not a fixture.
goto_url(PROD + "/embed?code=kiosk-demo&asset=BTC")  # noqa: F821
time.sleep(7)
s = Segment("03-widget")
s.hold(14)
s.done()

# 4. The dashboard, reading the router contract.
goto_url(PROD + "/dashboard?code=kiosk-demo")  # noqa: F821
time.sleep(7)
s = Segment("04-dashboard")
s.grab(8, 0.08)
scroll_through(s, 10, 360)
s.hold(3)
s.done()

print("done. frames under", ROOT)
