# Demo video script — Kiosk

Target 2:30. Submission requires 2 to 3 minutes. Every shot is a real screen, no
slides of numbers that are not on screen behind them.

---

## 0:00 – 0:18 | The find

**Screen:** `IEventContracts.sol` open, cursor on the signature, `builder` and
`builderFeeBpsTimes1k` highlighted.

> Every order on a DreamDEX Event Contract carries two arguments most people never
> look at. An address called builder, and a fee for that builder. The venue is
> willing to pay whoever brings it order flow.

**Screen:** terminal, live `cast call` returning `0` for `getMaxBuilderFeeBpsTimes1k()`
on a real pool. Show the block number.

> Today that seat is empty. On Shannon and on mainnet the cap reads zero, and every
> order ever placed against Event Contracts passes the zero address. Nobody is
> sitting in the chair the venue built.

## 0:18 – 0:40 | The problem that seat solves

**Screen:** the number 83.5% large, with the three competing submissions that
independently measured it visible behind.

> Eighty three and a half percent of DreamDEX markets never see a single trade. That
> is not a pricing problem. The person with an opinion and the venue where that
> opinion pays out are never in the same room.

**Screen:** fast scroll of the 95 hackathon entries.

> Ninety five projects were built for this venue. Almost all of them are a place you
> have to go to.

## 0:40 – 1:20 | The product, on someone else's page

**Screen:** `examples/plain-html/index.html` in an editor. A static file. No build
step, no framework.

> This is a newsletter. Static HTML on disk. It shares nothing with us.

**Screen:** type the one line, save.

```html
<script src="https://kiosk.../embed.js" data-kiosk="shannon-weekly" data-asset="BTC" async></script>
```

**Screen:** browser refresh. The kiosk appears inline in the article. Countdown
ticking, live odds.

> One script tag. The odds are read from the live order book, not from us. The
> countdown is the real window expiry.

**Screen:** tap Up, wallet prompt, sign, confirmation with tx hash. Click through to
the Somnia explorer showing the order.

> The reader signs it themselves, against DreamDEX's own pool. We never hold the
> position. There it is on chain.

## 1:20 – 1:48 | Who got paid

**Screen:** `/dashboard?code=shannon-weekly`, the routed order appearing, notional and
fee earned.

> And the newsletter just earned twenty five basis points of that order. Thirteen to
> the host, twelve to us. Not from our database. Read straight off the router
> contract, so the host never has to trust our dashboard.

**Screen:** `cast call` on `KioskRouter.stats` returning the same numbers.

> Same numbers, straight from the chain.

## 1:48 – 2:10 | Why you should believe any of it

**Screen:** `node scripts/verify-live.mjs`, scrolling PASS lines.

> A transaction that returned a hash is not a completed operation. So this asserts
> four things only a real route can produce: the event matches the order's pool and
> notional, the accounting moved by exactly one order, the host wallet balance
> actually rose, and the router holds zero collateral.

**Screen:** the mutation table in the README.

> Thirty nine contract tests. And to prove they can fail, five deliberate bugs, each
> confirmed red, then reverted. One of them leaks a unit of dust per order. The
> fuzzer catches it.

## 2:10 – 2:30 | Where it goes

**Screen:** the builder argument, then the split table.

> Right now we charge our own fee because the venue's is switched off. The day
> DreamDEX raises that cap, the same integrator address is already threaded through
> as the builder, and the venue pays the host directly. Nothing in this code changes.

> Prediction markets do not need another terminal. They need to be where the argument
> already is. That is a kiosk.

---

## Shot list, in capture order

1. `IEventContracts.sol` signature, cursor highlight.
2. Terminal `cast call ... getMaxBuilderFeeBpsTimes1k()` on Shannon and mainnet.
3. DoraHacks BUIDL grid scroll.
4. `examples/plain-html/index.html` in editor, typing the script tag.
5. Browser: the host page before and after refresh.
6. Widget interaction through to signed tx, then the explorer.
7. `/dashboard?code=shannon-weekly` updating.
8. `cast call` on `KioskRouter.stats`.
9. `node scripts/verify-live.mjs` full run.
10. README mutation table.

## Rules for the capture

- No cut may hide a failure. If a take reverts, either fix it or show the failure and
  say what it was.
- Every number spoken must be on screen while it is spoken.
- No stock footage, no music swell over the technical claims.
