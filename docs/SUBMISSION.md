# DoraHacks submission copy — Kiosk

Paste-ready. Keep the vision field under the platform's limit; the long form goes in
the description.

---

## Name

Kiosk

## One line (the vision field)

Every DreamDEX order carries an unused `builder` argument the venue will pay for
routing flow. Kiosk is one script tag that turns any page into an Event Contract
storefront and pays the page owner, on chain, per order.

## Tags

Crypto / Web3, DeFi, Prediction Markets, Somnia, DreamDEX, Event Contracts,
Developer Tools

## Description

**The seat nobody is sitting in.**

`placeBinaryOrder` on a DreamDEX binary pool takes nine arguments, and two of them are
`address builder` and `uint96 builderFeeBpsTimes1k`. Every pool publishes a
`maxBuilderFeeBpsTimes1k`. DreamDEX shipped a native pay-the-router fee: the venue is
willing to pay whoever brings it order flow.

Read from the chain rather than from a doc, on 2026-09-11: that cap is `0` on Event
Contract pools on Shannon testnet at block 485483251 and on Somnia mainnet at block
409688211. The rail is wired and switched off, and every Event Contract order ever
placed passes `builder = address(0)`.

**The problem that seat exists to solve.**

Three separate teams in this hackathon independently measured the same number: 83.5%
of DreamDEX markets never see a single trade. That is not a pricing problem or a UX
problem inside the venue. The person with an opinion and the venue where that opinion
pays out are never in the same room.

Of the 95 projects submitted here, roughly 25 are AI trading agents, 12 are hedging
tools, 10 are market makers, 10 are reputation scores and 10 are analytics terminals.
Almost every one of them is a place you have to go to.

**Kiosk goes the other direction.**

```html
<script src="https://<host>/embed.js" data-kiosk="shannon-weekly" data-asset="BTC" async></script>
```

That is the entire integration. A newsletter, a Discord landing page, a docs site or a
static HTML file on disk drops in one line and gets a live Up/Down market inline. The
reader sees real order-book odds and a real countdown to the window expiry, picks a
side, and signs `placeBinaryOrder` with their own wallet against DreamDEX's own pool.
The host earns 25 bps of the routed notional, split on chain.

**Three properties hold by construction:**

- Kiosk never custodies a position. The reader signs the venue's own call. `KioskRouter`
  only prices and records the referral, and the test suite asserts the router's
  collateral balance is zero after every route.
- The split is enforced on chain, not in a database. A host reads
  `KioskRouter.stats(code)` themselves and never has to trust our dashboard.
- Every fee is reconcilable. The `Routed` event carries the pool and orderId of the
  reader's own order, so an indexer can prove no fee was collected without a matching
  fill.

**Why 25 bps.** The value metric is routed notional, because it is the only thing that
scales with what a host actually delivers. The price is anchored, not invented:
`maxBuilderFeeBpsTimes1k` caps this exact role at 100 bps where it is switched on, so
Kiosk charges a quarter of the venue's own sanctioned ceiling, and
`KioskRouter.MAX_FEE_BPS` makes it impossible to configure an integrator above it. The
host keeps 13 of the 25, the larger half, because the host brings the audience.

**What happens when the venue flips the switch.** The integrator address is already
threaded through the order path as the `builder` argument. The day DreamDEX raises the
cap, the venue pays the host directly and nothing in this codebase changes.

**Evidence.**

- 39 contract tests, green. Passing is not the bar, so five deliberate mutations were
  introduced into `KioskRouter.sol`, each confirmed to turn the suite red, then
  reverted. The sharpest one computes the integrator's share independently instead of
  as `fee - platformShare`; it leaks a unit of dust per order and the fuzzer finds it,
  which proves the sum-to-fee assertion is not a tautology.
- `scripts/verify-live.mjs` runs the full routed-order loop against a live Shannon
  market and asserts four post-conditions only a completed route can produce: the
  `Routed` event matches the order's pool and notional, router accounting advances by
  exactly one order, the host's wallet balance actually rises, and the router holds
  zero collateral.
- `examples/plain-html/` is a static HTML file with no build step, no framework and no
  shared stylesheet, proving the one-script-tag claim on a host that shares nothing
  with us.

**Stated limits.** This is Shannon testnet with tUSDC, and the venue's own maker and
taker fees read 0, so the fee mechanism is genuinely exercised but has not been priced
against real demand. The router is tested as a fee-and-attribution record; it cannot
itself prove the orderId it was handed corresponds to a real fill, which is why the
event carries the fields an indexer needs to check.

## Links

- GitHub: <repo url>
- Demo: <deployed url>
- Video: <video url>
- Dashboard: <deployed url>/dashboard?code=kiosk-demo
- Live widget on a third-party page: <deployed url>/demo

## Feedback report on the SDK and docs (the optional deliverable)

Collected while building, all reproducible:

1. `@somnia-chain/markets-sdk/dist/eventsAbi.js` is not reachable through the package
   `exports` map, so the documented deep import throws `ERR_PACKAGE_PATH_NOT_EXPORTED`.
   The starter template works around it with a relative path into `node_modules`. Either
   the export map or the docs should be corrected.
2. `placeBinaryOrder`'s `price` is always the YES-side price, for all four `kind`
   values. `BUY_NO` escrows `quantity * (1e6 - price)`. This is not stated in the
   Event Contracts docs and is easy to get backwards.
3. Binary pools have no deposit step for trading. The pool auto-pulls escrow: an ERC-20
   allowance for buys, a one-time ERC-6909 `setOperator` grant for sells.
   `getWithdrawableBalance` is payout-fallback credit, not trading margin, so depositing
   into it locks funds while the order still pulls from the wallet.
4. The bot kit's `gotchas.ts` documents `getMaxBuilderFeeBpsTimes1k()` returning
   `100000` on mainnet. That is true of spot CLOB pools but not of Event Contract pools,
   which read `0` on mainnet too. The comment reads as if it covers both.
5. Builder codes are guarded out of the bot kit entirely by `assertBuilderDisabled`,
   which means the kit's users cannot discover the venue's own monetization rail exists.
