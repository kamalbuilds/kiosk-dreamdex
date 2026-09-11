# Kiosk

**One script tag turns any page into a DreamDEX Event Contract storefront, and pays
the page owner for the order flow.**

Somnia × DreamDEX Event Contracts Hackathon. Shannon testnet, chain 50312.

**Live: https://kiosk-dreamdex.vercel.app**
Widget on a third-party page: https://kiosk-dreamdex.vercel.app/demo
Host dashboard: https://kiosk-dreamdex.vercel.app/dashboard?code=kiosk-demo

```html
<script src="https://<host>/embed.js" data-kiosk="shannon-weekly" data-asset="BTC" async></script>
```

That is the whole integration. The reader picks Up or Down, signs with their own
wallet, the order lands on DreamDEX's own pool, and the host earns a share of every
order their audience routes.

---

## The finding this is built on

`placeBinaryOrder` on a DreamDEX binary pool does not take the six arguments you would
expect. It takes nine:

```solidity
function placeBinaryOrder(
    uint8   kind,
    uint256 price,
    uint256 quantity,
    uint64  expireTimestampNs,
    uint8   orderType,
    uint8   selfMatchingOption,
    address builder,                 // <-- who routed this order
    uint96  builderFeeBpsTimes1k,    // <-- what they get paid for it
    uint64  userData
) external returns (bool success, uint128 orderId);
```

and every pool publishes `maxBuilderFeeBpsTimes1k`. **DreamDEX shipped a native
pay-the-router fee.** The venue is willing to pay whoever brings it order flow.

Read from the chain on 2026-09-11, not from a doc:

| network | block | EC pool `maxBuilderFeeBpsTimes1k` |
| --- | --- | --- |
| Shannon testnet (50312) | 485483251 | `0` |
| Somnia mainnet (5031) | 409688211 | `0` |

So the rail is wired and currently switched off on Event Contract pools. The bot kit
documents a `100000` (1%) cap, but that applies to the spot CLOB pools, not these.
Every order placed against Event Contracts today passes `builder = address(0)` and
leaves the seat empty.

Kiosk is the product that sits in that seat. It does not wait for the switch:
`KioskRouter` charges its own 25 bps and splits it with the host, on chain, today. The
integrator address is already threaded through the order path as the `builder`
argument, so the day the venue raises the cap, the venue pays the host directly and
nothing here has to change.

## Why a widget and not another terminal

Reading all 95 submissions to this hackathon: roughly 25 are AI trading agents, 12 are
hedging tools, 10 are market makers, 10 are reputation scores, and 10 are analytics
terminals. Almost all of them are a place you have to go.

Three separate teams independently measured the same thing: **83.5% of DreamDEX
markets never see a single trade.** That is not a pricing problem or a UX problem
inside the venue. The person with an opinion and the venue where that opinion pays out
are never in the same room.

Kiosk goes the other direction. It puts the market inside the argument that is already
happening, on someone else's page, and gives that page owner a reason to care.

## Why 25 bps, and who keeps what

The value metric is routed notional, because that is the only thing that scales with
what the host actually delivers. A host who sends one trader who trades a lot is worth
more than a host who sends a hundred who bounce, and no seat count or page view
captures that.

The price point is not invented. DreamDEX set a ceiling for this exact role itself:
`maxBuilderFeeBpsTimes1k` caps the pay-the-router fee at `100000`, which is 100 bps, on
the pools where it is switched on. Kiosk charges **25 bps, a quarter of the venue's own
sanctioned ceiling**, and `KioskRouter.MAX_FEE_BPS` hard-caps any integrator at 100 bps
so the contract can never be configured above the number the venue itself considers
reasonable.

The split is 13 bps to the host, 12 bps to the platform. The host keeps the larger
half, on purpose: the host is the one bringing the audience, and the split is readable
on chain so they never have to take our word for it.

| | who pays | who receives | enforced by |
| --- | --- | --- | --- |
| 13 bps | the trader | the host | `KioskRouter.route` |
| 12 bps | the trader | Kiosk | `KioskRouter.route` |
| 0 bps today | n/a | the `builder` seat | the venue, when it raises the cap |

## Architecture

```
host page                      Kiosk                          DreamDEX
────────────────────────────────────────────────────────────────────────────
<script src=embed.js>   ─▶  sandboxed iframe  ─▶  reader's wallet signs
 data-kiosk="slug"          live book + odds       placeBinaryOrder(...)
                            read on-chain          on the venue's own pool
                                  │                         │
                                  ▼                         ▼
                            KioskRouter.route()       position is the
                            25 bps, split on-chain    reader's, always
                                  │
                                  ▼
                            host payout + Routed event
```

Three properties hold by construction:

- **Kiosk never custodies a position.** The reader signs `placeBinaryOrder` themselves
  against the venue's pool. `KioskRouter` only prices and records the referral. The
  test suite asserts the router's collateral balance is zero after every route.
- **The split is enforced on chain**, not in our database. A host can read
  `KioskRouter.stats(code)` themselves and does not have to trust our dashboard.
- **Every fee is reconcilable against a real order.** The `Routed` event carries the
  pool and orderId of the reader's own order, so an indexer can check that a fee was
  never collected without a matching fill.

### Repo

| path | what |
| --- | --- |
| `contracts/src/KioskRouter.sol` | the attribution and revenue rail |
| `contracts/test/KioskRouter.t.sol` | 39 tests, mutation-proven |
| `web/public/embed.js` | the drop-in loader a host pastes |
| `web/app/embed/` | the kiosk itself, what the iframe renders |
| `web/app/demo/` | a publisher host page embedding it |
| `web/app/dashboard/` | what a host sees: routed volume, fees, recent orders |
| `web/lib/kiosk.ts` | market discovery, book reads, the signed trade path |
| `examples/plain-html/` | a static HTML file with no build step that embeds the widget |
| `scripts/verify-live.mjs` | the live proof, asserts post-conditions on chain |
| `docs/WIN-CONDITIONS.md` | what we decided to build and why, before writing code |

## Running it

```bash
cp .env.example .env          # add a funded Shannon key. tUSDC + STT from the
                              # SomniaHacks faucet topic.
./scripts/deploy.sh           # deploys KioskRouter, writes the address back to .env
cd web && npm install && npm run dev
```

Then open `http://localhost:3000` for the pitch and a live widget,
`/demo` for the widget inside a third-party page, and
`/dashboard?code=kiosk-demo` for what a host sees.

Prove it actually trades:

```bash
node scripts/verify-live.mjs
```

## Contract tests

```
Suite result: ok. 39 passed; 0 failed; 0 skipped
```

Passing is not the bar; being able to fail is. Five mutations were introduced into
`KioskRouter.sol`, each confirmed to turn the suite red, then reverted:

| mutation | caught by |
| --- | --- |
| drop both `FeeTransferFailed` checks | 3 tests, incl. `trader must not be debited` |
| swap integrator and platform shares | 5 tests |
| delete the `BadSplit` guard | `test_SetIntegrator_RevertsBadSplit` |
| accrue `integratorShare` instead of `fee` | `test_Stats_MatchesAccounting` |
| compute `integratorShare` independently of `fee` | `testFuzz_Quote_SharesSumToFee`, off by 1 unit of dust |

The last one matters most: it proves the "shares sum to fee" assertion is not a
tautology. Computing the integrator's cut independently rather than as
`fee - platformShare` leaks a unit of dust per order, and the fuzzer finds it.

## Verified live on Shannon

`KioskRouter` is deployed at
[`0x57ED83B351eDe66b2cb9C0dDa1F2247E1Cc62Be7`](https://shannon-explorer.somnia.network/address/0x57ED83B351eDe66b2cb9C0dDa1F2247E1Cc62Be7)
on chain 50312, with `kiosk-demo`, `degen-lounge` and `shannon-weekly` registered at
25 bps, split 13 to the host and 12 to the platform.

Five real orders were placed against live DreamDEX pools and routed through it. Read
back from the chain:

| | value |
| --- | --- |
| routed orders | 5 |
| routed notional | 3.445 tUSDC |
| fees charged | 0.008611 tUSDC |
| host payout wallet holds | 0.003272 tUSDC |
| platform wallet holds | 0.003019 tUSDC |
| router holds | 0 |

The 0.002320 gap between fees charged and the two wallets is exactly the first route,
which paid the deployer before the payees were split apart. It reconciles to the unit.

Each run asserts four post-conditions that only a completed route can produce, because
a transaction that returned a hash is an accepted request, not a completed operation:

```
PASS  Routed event attributes 0.475000 tUSDC to "kiosk-demo" on pool 0x034c3E…6Faa
PASS  router accounting advanced by exactly 1 order, 0.475000 tUSDC notional, 0.001187 tUSDC fees
PASS  integrator wallet actually received 0.000617 tUSDC
PASS  router holds zero collateral, custody stayed with the trader and the payouts
```

**The first live run failed, and that is the point.** Three assertions passed and the
fourth caught that the trader, the host payout and the platform were all the deployer,
so every balance delta netted to zero and would have passed vacuously. `verify-live.mjs`
now refuses to run at all when the integrator payout is the trader. A fee paid to
yourself is not evidence.

### Two Somnia gas traps, for anyone following

Both cost real time and are now encoded in `scripts/deploy.sh`:

1. **A failed deploy burns the whole limit rather than reverting cleanly.** The deploy
   mined with `status 0` at 1,035,333 gas, then again at 3,982,050 after raising forge's
   estimate multiplier. `forge script`'s estimator undershoots here; an explicit
   `--gas-limit` on `forge create` worked first try.
2. **Fresh storage is priced roughly 28x Ethereum.** One `setIntegrator` writing a
   single small struct estimates **1,411,567 gas**. A 500,000 limit burned. Estimate
   from the node, never pin an Ethereum number.

## What is not proven

Stated plainly rather than buried:

- This is Shannon testnet with tUSDC, and the venue's own maker and taker fees read
  `0`. The fee mechanism is genuinely exercised, but it has not been priced against
  real demand.
- `KioskRouter` is tested as a fee-and-attribution record. The contract cannot itself
  prove the `pool` and `orderId` it was handed correspond to a real fill; that
  reconciliation is an indexer's job, and the event carries the fields to do it.
- No reentrancy test. With tUSDC there is no external call after the state writes, but
  a malicious collateral token is out of scope and untested.
- The tests cover a `bool`-returning ERC20. A USDT-style token that returns no data
  would fail differently and is not covered.
