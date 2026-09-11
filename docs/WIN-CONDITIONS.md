# WIN-CONDITIONS — Somnia x DreamDEX Event Contracts Hackathon

Written 2026-09-11 15:52 IST before any product code. Updated 22:56 IST with measured
results. Deadline (extended): **2026-09-11 23:30 IST**. Field: **104 BUIDLs**.

    Scoreboard: first edition, no prior winners. Strongest live rivals by measured
                evidence, read from their own submissions on 2026-09-11:
                Abadi (48329) ERC-4626 inventory-free maker, 148 windows quoted,
                  book 28% tighter, publishes its losses
                Defib (48399) 34-min testnet run, 54 first-trades-ever created,
                  157 edge takes
                Ballast (48291) pooled counterparty, cites 83.5% of 5,000 markets
                  never traded
                Sigma (48202) on-chain Black-Scholes fair value from EWMA vol
    Bar to beat: Abadi's 148 quoted windows is the high-water mark for measured
                live evidence. Ours: 8 routed orders, 13.205 tUSDC notional,
                0.033011 tUSDC fees, every figure read back from chain.
    Asset we will own: the routing and attribution rail. placeBinaryOrder carries
                `address builder, uint96 builderFeeBpsTimes1k` and each pool publishes
                `maxBuilderFeeBpsTimes1k`. Measured on chain: that cap is 0 on Event
                Contract pools on BOTH Shannon (block 485483251) and mainnet (block
                409688211), so the venue's own pay-the-router seat is wired and empty.
                Obtained by building it: KioskRouter takes its own 25 bps today and
                passes the integrator through as `builder` for the day the cap rises.
                Zero of the 104 submissions mention builder codes or integrator
                monetization, verified by reading every title and vision via the API.
    Bar to beat: 148 windows (Abadi). See above.
    Off-platform buyer: a crypto newsletter or Telegram community owner with an
                audience and no way to monetize it. They embed one script tag, their
                readers trade inside their own page, and they earn 13 bps of every
                order routed. They are not a trader and never open the venue's app.
    Single entry: Kiosk. One product, BUIDL 48491.
    Verb the brief names: "trading applications", "trade", "generate trading
                activity", "attract new users".
    Our product performs that verb: yes. web/lib/kiosk.ts placeAndRoute signs a real
                placeBinaryOrder from the reader's own wallet against the venue pool,
                then calls KioskRouter.route. Proven live: router totalOrders 6 to 8
                today, three txs status 1 per trade, host payout wallet credited.
    Metric plan: routed notional and fees, checked on chain against
                KioskRouter.stats(code) and shown at /dashboard?code=SLUG. Today: 8
                orders, 13.205 tUSDC. Target: first non-team integrator embedding.
    Live by: 2026-09-11 19:00 IST. Shipped and submitted, 4.5h before the deadline.
    Deviation from research: one. Initial thesis was "builder fee is our revenue".
                The chain read killed it (cap 0 on EC pools, both networks), so revenue
                moved to the router's own fee, which we control, with builder tagging
                kept wired as the upside case.

## The two gates that decided the last two losses

**ONE ENTRY, DEEP.** Kiosk only. No portfolio.

**THE VERB.** The brief says trade. Kiosk executes, and every claim below is backed by
a live fill:

- [x] real order signed and filled on a live Shannon EC pool through the widget
- [x] router fee collected, host payout wallet balance delta verified on chain
- [x] a second and third integrator code routing flow (degen-lounge, shannon-weekly)
- [x] dashboard numbers reconcile against chain reads, not a database

## Blind spots, stated rather than buried

- Shannon testnet with tUSDC, and the venue's own maker/taker fees read 0, so the fee
  economics are exercised mechanically but not against real demand.
- The widget sends a taker order, so when nothing rests on the other side the venue
  returns `ImmediateOrCancelNoFill` (0xd48c4403). That is the empty-book problem the
  product exists to solve, hitting the product itself.
- No non-team integrator has embedded Kiosk yet. Every routed order so far is ours.
