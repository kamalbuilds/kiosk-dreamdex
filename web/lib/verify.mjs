/**
 * Exercise the real chain layer against the real Somnia Shannon RPC.
 *
 *   node lib/verify.mjs               # discovery + books + a pool status read
 *   node lib/verify.mjs 0xPOOL        # read that specific pool instead
 *   node lib/verify.mjs --router-only # only the KioskRouter reads
 *
 * This imports lib/kiosk.ts itself rather than reimplementing it, so a green run
 * is evidence about the shipped code and not about a copy. TypeScript has no
 * runtime in node, so the two source files are transpiled with the project's own
 * `typescript` into lib/.verify-build, imported, and the directory is removed
 * again on exit.
 *
 * The three assertions below are written so they CAN fail:
 *  - the collateral constant must equal SOMNIA_TESTNET_ADDRESSES.testUsdc
 *  - the MarketCreated topic0 must equal the SDK's own marketCreatorEventsAbi
 *  - a discovered market's pool must report that same collateral on-chain
 * Break any one of them and this script exits non-zero.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
// Deep import: the SDK's `exports` map does not publish this module, which is
// exactly why lib/abi.ts declares the event itself. Reached through the path
// rather than the package name, as the template's discover.mjs does.
import { marketCreatorEventsAbi } from "../node_modules/@somnia-chain/markets-sdk/dist/eventsAbi.js";
import { keccak256, toBytes, toEventSelector } from "viem";

const here = dirname(fileURLToPath(import.meta.url));
const buildDir = join(here, ".verify-build");

function build() {
  mkdirSync(buildDir, { recursive: true });
  writeFileSync(join(buildDir, "package.json"), JSON.stringify({ type: "module" }));
  for (const name of ["abi", "kiosk"]) {
    const source = readFileSync(join(here, `${name}.ts`), "utf8");
    const out = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      fileName: `${name}.ts`,
    }).outputText;
    // node resolves relative specifiers literally, so give the emitted import
    // the extension the bundler does not need.
    writeFileSync(join(buildDir, `${name}.js`), out.replace(/from "\.\/abi"/g, 'from "./abi.js"'));
  }
  return import(pathToFileURL(join(buildDir, "kiosk.js")).href);
}

const args = process.argv.slice(2);
const routerOnly = args.includes("--router-only");
const poolArg = args.find((a) => /^0x[0-9a-fA-F]{40}$/.test(a));

let failures = 0;
function check(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  const kiosk = await build();

  console.log("=== invariants ===");
  check(
    "COLLATERAL matches SOMNIA_TESTNET_ADDRESSES.testUsdc",
    kiosk.COLLATERAL.toLowerCase() === SOMNIA_TESTNET_ADDRESSES.testUsdc.toLowerCase(),
    `${kiosk.COLLATERAL} vs ${SOMNIA_TESTNET_ADDRESSES.testUsdc}`,
  );

  const sdkEvent = marketCreatorEventsAbi.find((e) => e.name === "MarketCreated");
  const abiSource = readFileSync(join(here, "abi.ts"), "utf8");
  const ours = (await import(pathToFileURL(join(buildDir, "abi.js")).href)).marketCreatedEvent;
  check(
    "MarketCreated topic0 matches the SDK's marketCreatorEventsAbi",
    toEventSelector(ours) === toEventSelector(sdkEvent),
    toEventSelector(ours),
  );
  check("abi.ts declares the router's Routed event", abiSource.includes("event Routed("));

  check(
    'codeHash is keccak256 of the utf8 slug, the same bytes32 as keccak256("kiosk-demo") in Deploy.s.sol',
    kiosk.codeHash("kiosk-demo") === keccak256(toBytes("kiosk-demo")),
    kiosk.codeHash("kiosk-demo"),
  );
  check(
    "codeHash normalises case and surrounding space",
    kiosk.codeHash(" KIOSK-DEMO ") === kiosk.codeHash("kiosk-demo"),
  );

  if (routerOnly) {
    await verifyRouter(kiosk);
    return;
  }

  console.log("\n=== listLiveMarkets() against https://api.infra.testnet.somnia.network ===");
  const t0 = Date.now();
  const markets = await kiosk.listLiveMarkets();
  console.log(`scanned in ${Date.now() - t0}ms, ${markets.length} live markets\n`);

  if (markets.length === 0) {
    console.log(
      "ZERO live markets at this moment. That is a real (and possible) state, not a pass: " +
        "the Shannon series creator rolls windows continuously, so re-run in a few minutes.",
    );
    failures++;
  }

  const now = Math.floor(Date.now() / 1000);
  for (const m of markets) {
    console.log(
      `${m.asset.padEnd(4)} ${String(m.intervalSec / 60).padStart(3)}min window  ` +
        `expires in ${String(Math.round((m.expiry - now) / 60)).padStart(3)}min  ` +
        `pool=${m.pool}  strike=${kiosk.formatUnits6(m.strike)}`,
    );
    console.log(`      "${m.question}"`);
  }

  const target = poolArg ?? markets[0]?.pool;
  if (!target) {
    console.log("\nNo pool to read.");
    return;
  }

  console.log(`\n=== readPoolStatus(${target}) ===`);
  const status = await kiosk.readPoolStatus(target);
  const expirySec = Number(status.expiryNs / BigInt(1_000_000_000));
  console.log({
    finalized: status.finalized,
    expiryNs: status.expiryNs.toString(),
    expiresUtc: new Date(expirySec * 1000).toISOString(),
    maxBuilderFeeBpsTimes1k: status.maxBuilderFeeBpsTimes1k.toString(),
    tick: status.tick.toString(),
    lot: status.lot.toString(),
    minQty: status.minQty.toString(),
  });
  check(
    "builder fee cap is 0, so orders must pass builder=zero address",
    status.maxBuilderFeeBpsTimes1k === BigInt(0),
    `maxBuilderFeeBpsTimes1k=${status.maxBuilderFeeBpsTimes1k}`,
  );

  const tokens = await kiosk.readPoolTokens(target);
  check(
    "pool collateral on-chain is the tUSDC discovery filters on",
    tokens.collateral.toLowerCase() === kiosk.COLLATERAL.toLowerCase(),
    tokens.collateral,
  );

  console.log(`\n=== readBook(${target}, 5) ===`);
  const book = await kiosk.readBook(target, 5);
  const rows = Math.max(book.bids.length, book.asks.length);
  console.log("        bid qty      bid |  ask      ask qty");
  for (let i = 0; i < rows; i++) {
    const b = book.bids[i];
    const a = book.asks[i];
    console.log(
      `${(b ? b.quantity.toFixed(3) : "").padStart(15)} ${(b ? b.price.toFixed(3) : "").padStart(8)} | ` +
        `${(a ? a.price.toFixed(3) : "").padEnd(8)} ${(a ? a.quantity.toFixed(3) : "").padEnd(12)}`,
    );
  }
  const mid = kiosk.midProbability(book);
  console.log(`\nmid probability: ${mid === null ? "null (one side empty)" : mid.toFixed(4)}`);
  check("book has at least one resting level", book.bids.length + book.asks.length > 0);

  // A price/size from this book, put through the same grid maths placeAndRoute
  // uses, so the encoding is exercised rather than asserted.
  const probe = mid ?? book.asks[0]?.price ?? book.bids[0]?.price;
  if (probe !== undefined) {
    const price = kiosk.priceFromProbability(probe, status.tick);
    const qty = kiosk.quantityFromContracts(2, status.lot, status.minQty);
    console.log(
      `\ngrid: probability ${probe.toFixed(6)} -> price ${price} (tick ${status.tick}), ` +
        `2 contracts -> quantity ${qty} (lot ${status.lot})`,
    );
    check("snapped price sits on the tick grid", price % status.tick === BigInt(0));
    check("snapped quantity sits on the lot grid", qty % status.lot === BigInt(0));
    for (const [kind, label] of [
      [0, "BUY_YES"],
      [2, "BUY_NO"],
    ]) {
      console.log(
        `      notional ${label}: ${kiosk.formatUnits6(kiosk.notionalOf(kind, price, qty))} tUSDC`,
      );
    }
  }

  await verifyRouter(kiosk);
}

/**
 * The router half: `stats`, `integrators`, the totals, `quote`, and the `Routed`
 * feed the dashboard renders. Exercised against whatever NEXT_PUBLIC_KIOSK_ROUTER
 * points at, which is a deployed KioskRouter on Shannon in production and can be
 * a local anvil deploy while the Shannon address does not exist yet.
 */
async function verifyRouter(kiosk) {
  if (!kiosk.hasRouter()) {
    console.log(
      "\nNEXT_PUBLIC_KIOSK_ROUTER unset: router reads skipped. They are unverified until it is set.",
    );
    return;
  }
  const code = process.env.KIOSK_CODE ?? "kiosk-demo";
  console.log(`\n=== KioskRouter ${kiosk.routerAddress()} · code "${code}" ===`);

  const [stats, integrator, totals] = await Promise.all([
    kiosk.routerStats(code),
    kiosk.routerIntegrator(code),
    kiosk.routerTotals(),
  ]);
  console.log({
    active: stats.active,
    payout: stats.payout,
    feeBps: stats.feeBps,
    platformBps: integrator.platformBps,
    orders: stats.orders.toString(),
    notional: kiosk.formatUnits6(stats.notional),
    fees: kiosk.formatUnits6(stats.fees),
    totalOrders: totals.orders.toString(),
    totalNotional: kiosk.formatUnits6(totals.notional),
    totalFees: kiosk.formatUnits6(totals.fees),
  });
  check("stats and integrators agree on the payout address", stats.payout === integrator.payout);
  check(
    "stats and integrators agree on the fee",
    stats.feeBps === integrator.feeBps && integrator.platformBps <= integrator.feeBps,
  );

  const quote = await kiosk.quoteFee(code, BigInt(10_000_000));
  console.log(
    `quote on 10 tUSDC notional: fee=${kiosk.formatUnits6(quote.fee)} ` +
      `integrator=${kiosk.formatUnits6(quote.integratorShare)} ` +
      `platform=${kiosk.formatUnits6(quote.platformShare)}`,
  );
  check("quote shares sum to the fee", quote.integratorShare + quote.platformShare === quote.fee);
  if (integrator.active) {
    check(
      "quote equals feeBps of notional",
      quote.fee === (BigInt(10_000_000) * BigInt(integrator.feeBps)) / BigInt(10_000),
      `${quote.fee} on ${integrator.feeBps} bps`,
    );
  }

  const feed = await kiosk.recentRouted(code, 90, 25);
  console.log(`\nRouted feed: ${feed.length} event(s) in the scanned window`);
  for (const r of feed) {
    console.log(
      `  block ${r.blockNumber} ${kiosk.KIND_LABEL[r.kind]} ` +
        `${kiosk.formatUnits6(r.quantity)} @ ${(Number(r.price) / 1e6).toFixed(3)} ` +
        `notional=${kiosk.formatUnits6(r.notional)} fee=${kiosk.formatUnits6(r.fee)} ` +
        `share=${kiosk.formatUnits6(r.integratorShare)} tx=${r.txHash}`,
    );
  }
  if (Number(stats.orders) > 0) {
    check("the Routed feed found the orders the counters report", feed.length > 0);
    const summed = feed.reduce((a, r) => a + r.notional, BigInt(0));
    check(
      "summed event notional matches the counter",
      summed === stats.notional,
      `${kiosk.formatUnits6(summed)} vs ${kiosk.formatUnits6(stats.notional)}`,
    );
  }
}

try {
  await main();
} finally {
  rmSync(buildDir, { recursive: true, force: true });
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
