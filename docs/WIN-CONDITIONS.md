# WIN-CONDITIONS — Somnia x DreamDEX Event Contracts Hackathon

Written 2026-09-11 15:52 IST, before any product code.
Deadline (extended): **2026-09-11 23:30 IST**. Field: **95 BUIDLs, 430 hackers.**

    Scoreboard: first edition, no prior winners. Strongest live rivals by measured
                evidence, read from their own submissions on 2026-09-11:
                Abadi (48329) — ERC-4626 inventory-free maker, 148 windows quoted,
                  book 28% tighter, publishes its losses
                Defib (48399) — 34-min testnet run, 54 first-trades-ever created,
                  157 edge takes, attacks the 83.5%-dead-market number
                Ballast (48291) — pooled counterparty, 83.5% of 5,000 markets never
                  traded
                Sigma (48202) — on-chain Black-Scholes fair value, EWMA vol
    Bar to beat: a single measured live-testnet run with a number a judge can
                verify on-chain. Abadi's 148 windows is the high-water mark.
    Asset we will own: the routing + attribution rail. `placeBinaryOrder` carries
                `address builder, uint96 builderFeeBpsTimes1k` and each pool exposes
                `maxBuilderFeeBpsTimes1k` — DreamDEX designed a native pay-the-router
                fee. Measured on-chain: cap is 0 on BOTH testnet (block 485483251)
                and mainnet EC pools (block 409688211); the kit's documented 100000
                (1%) cap applies to spot CLOB pools, not Event Contracts. So the rail
                exists and is switched off. We own the layer that is already wired to
                it AND earns independently of it: Kiosk Router takes its own routing
                fee in collateral, splits it with the integrator, and stamps the
                builder tag the moment the venue raises the cap.
                Obtained by: building it. Zero of the 95 submissions mention builder
                codes, fee routing, or integrator monetization — verified by reading
                all 95 titles + visions pulled from the DoraHacks API.
    Off-platform buyer: a crypto Telegram/Discord community owner with an audience
                and no way to monetize it. They embed one script tag, their members
                trade Up/Down inside their own channel, and the owner earns a cut of
                every order their audience routes. They are not a trader and do not
                use the venue's own app.
    Single entry: Kiosk. One product. No portfolio.
    Verb the brief names: "trading applications", "trade", "generate trading
                activity", "attract new users".
    Our product performs that verb: yes — the widget signs and submits a real
                `placeBinaryOrder` from the user's own key against a live Shannon
                pool, and the router collects a real fee in the same flow. Not a
                dashboard, not read-only. Code path recorded below once built.
    Metric plan: routed notional (tUSDC) and fills created through Kiosk, plus fees
                collected by the router. Checked on-chain against the router address
                and the pool's fill logs, shown live on the public dashboard.
    Live by: 2026-09-11 21:00 IST, 2.5h before the deadline.
    Deviation from research: one. Initial thesis was "builder fee = our revenue".
                Chain read killed it (cap 0 on EC pools, both networks). Revenue moved
                to the router's own fee, which we control; builder tagging stays wired
                as the upside case. Recorded rather than quietly dropped.

## The two gates that decided the last two losses

**ONE ENTRY, DEEP.** Kiosk only. Consumer UX, technical depth, and ecosystem impact
are covered by one product, not three.

**THE VERB.** The brief says trade. Kiosk executes. Every claim below is backed by a
live fill or it does not ship:

- [ ] real order signed and filled on a live Shannon EC pool through the widget
- [ ] router fee actually collected, balance delta shown on-chain
- [ ] a second integrator (Telegram bot) routes flow and earns its split
- [ ] dashboard numbers reconcile against chain reads, not a database

## Blind spot, stated up front

Testnet collateral is tUSDC and the venue's own maker/taker fees are 0, so the fee
economics are exercised mechanically but not against real demand. Named in the
submission rather than hidden.
