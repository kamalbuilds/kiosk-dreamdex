"""Film the Rabby approval flow for the Kiosk embed widget.

Run inside the Brave harness:

    bh-multi run deepsurge "exec(open('scripts/capture_rabby_flow.py').read())"

Why this is shaped the way it is: Rabby's injected provider holds every
`ethereum.request` behind a readiness check that includes
`document.visibilityState === 'visible'`. A tab the harness merely `switch_tab`ed
to is still a background tab, so the call queues forever and no approval window is
ever requested. Every point where the dapp is about to issue a request therefore
re-foregrounds the dapp tab with `Target.activateTarget`, including between
prompts in a multi-prompt flow, because filming prompt 1 backgrounds the dapp and
would otherwise wedge prompt 2.
"""

import time

exec(open("/Users/kamal/Developer/browser-harness/wallet_control.py").read())

EMBED = "https://kiosk-dreamdex.vercel.app/embed?code=kiosk-demo&asset=BTC"
OUTDIR = "/tmp/rabbyframes"
MAX_PROMPTS = 3


def dapp_tab():
    """The embed tab, created fresh if the harness reaped the last one."""
    for t in _targets():
        if t.get("type") == "page" and "embed?code=kiosk-demo" in (t.get("url") or ""):
            return t.get("targetId")
    tid = new_tab(EMBED)  # noqa: F821
    time.sleep(6)
    return tid


def focus_dapp(tid, tries=4):
    """Foreground the dapp and confirm it, retrying.

    Not cosmetic: while the tab reads `hidden`, Rabby's provider queues the dapp's
    next request forever instead of raising a prompt, so a flow with more than one
    prompt dies silently right here.
    """
    for _ in range(tries):
        cdp("Target.activateTarget", targetId=tid)  # noqa: F821
        switch_tab(tid)  # noqa: F821
        time.sleep(0.7)
        if js("document.visibilityState") == "visible":  # noqa: F821
            return "visible"
    return js("document.visibilityState")  # noqa: F821


def seconds_left():
    """Seconds until the current 5-minute window closes, or None."""
    raw = js(  # noqa: F821
        "(function(){var m=document.body.innerText.match(/CLOSES IN\\s*(\\d+):(\\d+)/);"
        "return m?String(Number(m[1])*60+Number(m[2])):'';})()"
    )
    return int(raw) if raw else None


def wait_for_fresh_window(tid, need=90, limit=330):
    """Do not start a trade that the window will close underneath.

    The market settles on a 5-minute boundary; an order sent with seconds left can
    miss it, and then the capture shows a prompt that led nowhere.
    """
    waited = 0
    while waited < limit:
        left = seconds_left()
        if left is None or left >= need:
            return {"seconds_left": left, "waited": waited}
        time.sleep(5)
        waited += 5
        focus_dapp(tid)
    return {"seconds_left": seconds_left(), "waited": waited, "gave_up": True}


def buy_button():
    """Rect of the widget's Buy button, in CSS pixels, or None."""
    raw = js(  # noqa: F821
        "(function(){var bs=Array.from(document.querySelectorAll('button'));"
        "for(var i=0;i<bs.length;i++){var t=(bs[i].textContent||'').trim();"
        "if(/^Buy\\s/.test(t)&&!bs[i].disabled){bs[i].scrollIntoView({block:'center'});"
        "var r=bs[i].getBoundingClientRect();"
        "return JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2,label:t});}}"
        "return '';})()"
    )
    return json.loads(raw) if raw else None


def widget_summary():
    return js("document.body.innerText.replace(/\\n+/g,' | ').slice(0,400)")  # noqa: F821


def clear_stale_approvals(limit=4):
    """Reject anything already queued, so the filmed run starts from nothing.

    A leftover prompt is not harmless: Rabby serialises approvals, so an old one
    sitting in front of the queue means the prompt actually being filmed is the wrong
    transaction.
    """
    cleared = []
    for _ in range(limit):
        tid = find_approval(timeout=2.0)
        if not tid:
            break
        switch_tab(tid)  # noqa: F821
        time.sleep(0.5)
        hit = js(  # noqa: F821
            "(function(){var want=['Cancel','Reject','Reject All'];"
            "var bs=Array.from(document.querySelectorAll('button'));"
            "for(var i=0;i<want.length;i++){for(var j=0;j<bs.length;j++){"
            "if((bs[j].textContent||'').trim()===want[i]){bs[j].click();return want[i];}}}"
            "return '';})()"
        )
        cleared.append(hit or "none")
        time.sleep(1.5)
    return cleared


def main():
    rec = FrameRecorder(OUTDIR, fps=11.0)
    report = {"frames_dir": OUTDIR, "prompts": []}

    report["cleared_stale"] = clear_stale_approvals()

    tid = dapp_tab()
    report["dapp_target"] = tid
    focus_dapp(tid)
    # Reload: rejecting a stale prompt leaves the widget holding an orphaned promise,
    # and a reloaded page also gives the video the real cold-start connect.
    goto_url(EMBED)  # noqa: F821
    time.sleep(7)
    report["visibility"] = focus_dapp(tid)

    alive = provider_alive(timeout=8.0, target_id=tid)
    report["provider"] = alive
    if not alive.get("alive"):
        report["fatal"] = "provider still wedged after activate"
        return report

    # Connect. Already-granted permission resolves with no prompt, which is fine.
    js(  # noqa: F821
        "(function(){window.__conn='pending';"
        "window.ethereum.request({method:'eth_requestAccounts'})"
        ".then(function(a){window.__conn='ok:'+JSON.stringify(a)})"
        ".catch(function(e){window.__conn='err:'+e.message});})()"
    )
    for _ in range(20):
        if js("window.__conn") != "pending":  # noqa: F821
            break
        time.sleep(0.5)
    report["connect"] = js("window.__conn")  # noqa: F821

    report["window_guard"] = wait_for_fresh_window(tid)
    focus_dapp(tid)
    rec.roll(1.5, tag="widget-connected")
    report["widget_before"] = widget_summary()

    btn = buy_button()
    report["buy_button"] = btn
    if not btn:
        report["fatal"] = "no enabled Buy button on the widget"
        return report

    rec.roll(0.8, tag="pre-click")
    # Input.dispatchMouseEvent is a trusted event and carries user activation,
    # unlike element.click() from Runtime.evaluate.
    click_at_xy(btn["x"], btn["y"])  # noqa: F821

    for i in range(MAX_PROMPTS):
        # Re-foreground the dapp so it can actually issue request i+1.
        focus_dapp(tid)
        rec.roll(0.6, tag="dapp-wait-%d" % i)
        got = film_approval(rec, hold=3.0, timeout=25.0, tail=0.8)
        report["prompts"].append(got)
        if not got.get("approved"):
            break
        time.sleep(2.0)

    focus_dapp(tid)
    rec.roll(4.0, tag="success")
    report["widget_after"] = widget_summary()
    report["frames"] = rec.n
    return report


RESULT = main()
print(json.dumps(RESULT, indent=2, default=str))
