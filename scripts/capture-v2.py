"""Capture the Kiosk demo as real motion, page-only.

Runs inside the browser-harness runtime. Two properties that matter:

- `capture_screenshot()` returns a PAGE capture, not a screen capture. No menu bar, no
  tab strip, no desktop, so nothing of the operator's machine can leak into the film
  and no exclusive screen access is needed.
- Frames are grabbed at roughly 11fps WHILE the interface is driven, so countdowns,
  order books and state changes are genuine motion rather than a pan over stills.

The wallet approval lives in a separate CDP target, so a screen recording would show
it as a small floating window. Capturing that target directly gives it a full frame,
which is the shot the first cut was missing entirely.

    bh-multi run deepsurge "exec(open('scripts/capture-v2.py').read())"
"""

import os
import shutil
import time

ROOT = "/tmp/kioskv2"
PROD = "https://kiosk-dreamdex.vercel.app"
RABBY = "acmacodkjbdgmoleebolmdjonilkdbch"


class Seg:
    def __init__(self, name):
        self.dir = os.path.join(ROOT, name)
        shutil.rmtree(self.dir, ignore_errors=True)
        os.makedirs(self.dir, exist_ok=True)
        self.n = 0
        self.name = name

    def grab(self, k=1):
        for _ in range(k):
            try:
                shutil.copy(capture_screenshot(), os.path.join(self.dir, "f%04d.png" % self.n))  # noqa: F821
                self.n += 1
            except Exception:
                pass

    def hold(self, secs):
        end = time.time() + secs
        while time.time() < end:
            self.grab()

    def pan(self, top, steps=14, per=2):
        """Scroll in small increments, filming each one, so the motion is real."""
        start = 0
        for i in range(steps):
            y = int(start + (top - start) * (i + 1) / steps)
            js("window.scrollTo(0,%d)" % y)  # noqa: F821
            self.grab(per)

    def done(self):
        print("  %-16s %d frames" % (self.name, self.n))
        return self.n


def current_url():
    try:
        return js("location.href")  # noqa: F821
    except Exception:
        return ""


def find_target(substr):
    r = cdp("Target.getTargets", {})  # noqa: F821
    for t in r.get("targetInfos", []):
        if substr in (t.get("url") or ""):
            return t.get("targetId")
    return None



def connect_and_film(seg):
    """Rabby does not restore the grant on a fresh page load: the widget's mount-time
    eth_accounts returns [] and it renders Connect wallet. Firing eth_requestAccounts
    is what actually engages the wallet, and the approval it raises is filmed."""
    js("(function(){window.__rq='pending';window.ethereum.request({method:'eth_requestAccounts'}).then(function(a){window.__rq='OK:'+a[0]}).catch(function(e){window.__rq='ERR:'+(e&&e.message?e.message:String(e))});})()")  # noqa: F821
    home = find_target("/embed?code=kiosk-demo")
    for _ in range(12):
        tid = find_target("notification.html")
        if tid:
            switch_tab(tid)  # noqa: F821
            time.sleep(1.2)
            seg.hold(2.0)
            js("(function(){var w=['Connect','Confirm','Sign','Approve'];var bs=Array.from(document.querySelectorAll('button'));for(var i=0;i<w.length;i++){for(var j=0;j<bs.length;j++){if((bs[j].textContent||'').trim()===w[i]){bs[j].click();return;}}}})()")  # noqa: F821
            time.sleep(2.0)
            if home:
                switch_tab(home)  # noqa: F821
                time.sleep(1.5)
            break
        seg.grab(2)
        time.sleep(0.5)
    for _ in range(10):
        st = js("String(window.__rq)")  # noqa: F821
        if st and st != "pending":
            print("  connect:", st[:46])
            break
        time.sleep(0.6)
    time.sleep(2)


print("capture v2")

# A. The host page. A static-feeling editorial page with the kiosk planted in it.
goto_url(PROD + "/demo")  # noqa: F821
time.sleep(8)
s = Seg("A-host")
s.grab(6)
s.pan(1500, steps=18)
s.hold(3)
s.done()

# B. The kiosk, live. Held so the countdown ticks and the book refreshes on camera.
goto_url(PROD + "/embed?code=kiosk-demo&asset=BTC")  # noqa: F821
time.sleep(8)
s = Seg("B-widget")
s.hold(4)
connect_and_film(s)
s.hold(4)
js("(function(){var b=Array.from(document.querySelectorAll('button')).filter(function(x){return x.textContent.trim()==='25'})[0]; if(b)b.click();})()")  # noqa: F821
s.hold(5)
s.done()

# C. The trade. Fire the order, then film the approval target full frame.
s = Seg("C-approve")
js("(function(){var b=Array.from(document.querySelectorAll('button')).filter(function(x){return /^Buy /.test(x.textContent||'')})[0]; if(b)b.click();})()")  # noqa: F821
s.hold(3)

approved = 0
for _ in range(3):
    tid = None
    for _ in range(14):
        tid = find_target("notification.html")
        if tid:
            break
        s.grab(2)
        time.sleep(0.6)
    if not tid:
        break
    switch_tab(tid)  # noqa: F821
    time.sleep(1.5)
    s.hold(2.5)  # the approval, full frame
    js("(function(){var w=['Confirm','Sign','Approve','Continue'];var bs=Array.from(document.querySelectorAll('button'));for(var i=0;i<w.length;i++){for(var j=0;j<bs.length;j++){if((bs[j].textContent||'').trim()===w[i]){bs[j].click();return;}}}})()")  # noqa: F821
    approved += 1
    time.sleep(2.5)
    tid2 = find_target("/embed?code=kiosk-demo")
    if tid2:
        switch_tab(tid2)  # noqa: F821
        time.sleep(1.5)
    s.hold(2)
print("  approvals clicked:", approved)

# The receipt.
tid2 = find_target("/embed?code=kiosk-demo")
if tid2:
    switch_tab(tid2)  # noqa: F821
    time.sleep(2)
s.hold(7)
s.done()

# D. The money, read from the router contract.
goto_url(PROD + "/dashboard?code=kiosk-demo")  # noqa: F821
time.sleep(9)
s = Seg("D-dash")
s.grab(6)
s.pan(900, steps=12)
s.hold(4)
s.done()

print("done ->", ROOT)
