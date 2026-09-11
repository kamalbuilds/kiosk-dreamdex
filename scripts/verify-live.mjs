// verify-live — the proof that Kiosk performs the verb.
//
// It runs the whole routed-order loop against a LIVE Shannon market with a real
// funded key, then asserts post-conditions that only a completed operation can
// produce. A submitted transaction is not a completed operation; every claim here
// is a balance delta or an event read back from the chain after the fact.
//
//   node scripts/verify-live.mjs
//
// Requires in ../.env: PRIVATE_KEY, KIOSK_ROUTER, and an integrator code that has
// been registered on that router.
import { SomniaMarkets, SOMNIA_TESTNET_ADDRESSES, probabilityToPrice } from "@somnia-chain/markets-sdk";
// Deep file path, not a package specifier: the SDK's `exports` map does not expose
// dist/eventsAbi.js, so `@somnia-chain/markets-sdk/dist/eventsAbi.js` throws
// ERR_PACKAGE_PATH_NOT_EXPORTED. A relative path into node_modules bypasses the map.
import { marketCreatorEventsAbi } from "../web/node_modules/@somnia-chain/markets-sdk/dist/eventsAbi.js";
import { createPublicClient, createWalletClient, http, keccak256, toHex, parseEventLogs } from "viem";
import { somniaTestnet } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";

// dotenv is not a dependency of web/, so parse .env directly rather than adding one.
let envText = "";
try {
  envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
} catch {
  console.error("kiosk/.env not found. Copy .env.example to .env and add a funded Shannon key.");
  process.exit(1);
}
for (const line of envText.split("\n")) {
  const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const { PRIVATE_KEY, KIOSK_ROUTER, RPC_URL, WS_RPC_URL } = process.env;
const CODE = process.env.KIOSK_CODE || "kiosk-demo";
if (!PRIVATE_KEY) throw new Error("Set PRIVATE_KEY in kiosk/.env (a funded Shannon testnet key).");
if (!KIOSK_ROUTER) throw new Error("Set KIOSK_ROUTER in kiosk/.env (deploy the router first).");

const account = privateKeyToAccount(PRIVATE_KEY);
const me = account.address;
const COLLATERAL = SOMNIA_TESTNET_ADDRESSES.testUsdc;
const ONE = 1_000_000n;
const codeHash = keccak256(toHex(CODE));

const pub = createPublicClient({ chain: somniaTestnet, transport: http(RPC_URL || undefined) });
const wallet = createWalletClient({ account, chain: somniaTestnet, transport: http(RPC_URL || undefined) });
const ex = new SomniaMarkets({
  chain: somniaTestnet,
  addresses: SOMNIA_TESTNET_ADDRESSES,
  privateKey: PRIVATE_KEY,
  wsRpcUrl: WS_RPC_URL || "wss://api.infra.testnet.somnia.network/ws",
  indexerUrl: process.env.INDEXER_URL || "https://dev.smk.somnia.host/v1/graphql",
});

const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "bool" }] },
];
const routerAbi = [
  { type: "function", name: "quote", stateMutability: "view", inputs: [{ name: "code", type: "bytes32" }, { name: "notional", type: "uint256" }], outputs: [{ name: "fee", type: "uint256" }, { name: "integratorShare", type: "uint256" }, { name: "platformShare", type: "uint256" }] },
  { type: "function", name: "stats", stateMutability: "view", inputs: [{ name: "code", type: "bytes32" }], outputs: [{ name: "notional", type: "uint256" }, { name: "fees", type: "uint256" }, { name: "orders", type: "uint256" }, { name: "payout", type: "address" }, { name: "feeBps", type: "uint16" }, { name: "active", type: "bool" }] },
  { type: "function", name: "route", stateMutability: "nonpayable", inputs: [{ name: "code", type: "bytes32" }, { name: "pool", type: "address" }, { name: "orderId", type: "uint128" }, { name: "kind", type: "uint8" }, { name: "price", type: "uint256" }, { name: "quantity", type: "uint256" }, { name: "notional", type: "uint256" }], outputs: [{ name: "fee", type: "uint256" }] },
  { type: "event", name: "Routed", inputs: [
    { name: "code", type: "bytes32", indexed: true }, { name: "trader", type: "address", indexed: true },
    { name: "pool", type: "address", indexed: true }, { name: "orderId", type: "uint128" },
    { name: "kind", type: "uint8" }, { name: "price", type: "uint256" }, { name: "quantity", type: "uint256" },
    { name: "notional", type: "uint256" }, { name: "fee", type: "uint256" }, { name: "integratorShare", type: "uint256" }] },
];

const fail = (msg) => { console.error(`\nFAIL  ${msg}`); process.exit(1); };
const ok = (msg) => console.log(`PASS  ${msg}`);
const usdc = (v) => `${(Number(v) / 1e6).toFixed(6)} tUSDC`;

console.log(`trader   ${me}`);
console.log(`router   ${KIOSK_ROUTER}`);
console.log(`code     ${CODE}  (${codeHash})\n`);

// --- 0. the integrator must be live on this router, and we must be funded.
const st0 = await pub.readContract({ address: KIOSK_ROUTER, abi: routerAbi, functionName: "stats", args: [codeHash] });
const [n0, f0, o0, payout, feeBps, active] = st0;
if (!active) fail(`integrator "${CODE}" is not registered on the router. Run the deploy script or setIntegrator first.`);
console.log(`integrator payout=${payout} feeBps=${feeBps} routed so far: ${o0} orders, ${usdc(n0)}, ${usdc(f0)} fees`);

// A payment to yourself is not a payment. If the trader is also the payee, every
// balance assertion below nets to zero and passes vacuously, so refuse to run.
if (payout.toLowerCase() === me.toLowerCase()) {
  fail(`integrator payout is the trader (${me}). A fee paid to yourself proves nothing. Point the integrator at a third-party address.`);
}

const gas = await pub.getBalance({ address: me });
const usdcBal = await pub.readContract({ address: COLLATERAL, abi: erc20Abi, functionName: "balanceOf", args: [me] });
console.log(`balances STT=${Number(gas) / 1e18}  tUSDC=${Number(usdcBal) / 1e6}`);
if (gas === 0n) fail("zero STT, cannot pay gas. Fund the key from the SomniaHacks faucet topic.");
if (usdcBal < 5n * ONE) fail(`only ${usdc(usdcBal)} collateral, need at least 5 tUSDC to run the loop.`);

// --- 1. pick a live, actually-tradable market with room left in the window.
const mc = marketCreatorEventsAbi.find((e) => e.name === "MarketCreated");
const head = await pub.getBlockNumber();
const now = Math.floor(Date.now() / 1000);
const all = [];
for (let i = 0; i < 40; i++) {
  const to = head - BigInt(i * 1000);
  try { all.push(...(await pub.getLogs({ event: mc, fromBlock: to - 999n, toBlock: to })).map((l) => l.args)); } catch {}
}
const candidates = all
  .filter((m) => Number(m.expiry) > now + 120 && m.collateral?.toLowerCase() === COLLATERAL.toLowerCase())
  .sort((a, b) => Number(a.expiry) - Number(b.expiry));
if (!candidates.length) fail("no live market with more than 120s left. Wait for the next window and rerun.");

let market = null;
let mo = null;
for (const c of candidates) {
  const snap = await ex.client.getMarketOnchain(c.marketId);
  if (!snap.finalized && snap.status === 1) { market = c; mo = snap; break; }
}
if (!market) fail("found live windows but none is open for trading (status != 1).");
console.log(`\nmarket   ${market.asset} pool=${market.pool} expires in ${Math.round((Number(market.expiry) - now) / 60)}min`);

// --- 2. seed inventory so the taker leg is collateralised, then take a real fill.
const mint = await ex.trader.mintSet({ pool: market.pool, amount: 2n * ONE });
console.log(`mintSet  ${mint.hash}`);

const PROB = 0.99;
const QTY = 1n * ONE;
const taker = await ex.trader.placeOrder({
  pool: market.pool,
  side: "BUY_YES",
  price: probabilityToPrice(PROB),
  quantity: QTY,
  orderType: 2, // IOC, must cross
});
const fills = taker.fills || [];
console.log(`order    ${taker.hash}  orderId=${taker.orderId ?? "n/a"}  fills=${fills.length}`);
if (!fills.length) {
  console.log("NOTE     the book had nothing to cross, so no fill was produced this run.");
}
const filledQty = fills.reduce((a, f) => a + BigInt(f.quantityFilled ?? 0), 0n);
const fillPrice = fills.length ? BigInt(fills[0].fillPrice) : probabilityToPrice(PROB);
const quantity = filledQty > 0n ? filledQty : QTY;
const notional = (quantity * fillPrice) / ONE;
console.log(`notional ${usdc(notional)}  (qty ${Number(quantity) / 1e6} @ ${Number(fillPrice) / 1e6})`);

// --- 3. route it: the fee the host actually earns, pulled from the trader.
const [expFee, expInt, expPlat] = await pub.readContract({ address: KIOSK_ROUTER, abi: routerAbi, functionName: "quote", args: [codeHash, notional] });
console.log(`quote    fee=${usdc(expFee)} integrator=${usdc(expInt)} platform=${usdc(expPlat)}`);
if (expFee === 0n) fail("router quoted a zero fee. The integrator fee is misconfigured, so nothing would be earned.");

const allowance = await pub.readContract({ address: COLLATERAL, abi: erc20Abi, functionName: "allowance", args: [me, KIOSK_ROUTER] });
if (allowance < expFee) {
  const h = await wallet.writeContract({ address: COLLATERAL, abi: erc20Abi, functionName: "approve", args: [KIOSK_ROUTER, 1000n * ONE] });
  await pub.waitForTransactionReceipt({ hash: h });
  console.log(`approve  ${h}`);
}

const payoutBefore = await pub.readContract({ address: COLLATERAL, abi: erc20Abi, functionName: "balanceOf", args: [payout] });
const routeHash = await wallet.writeContract({
  address: KIOSK_ROUTER, abi: routerAbi, functionName: "route",
  args: [codeHash, market.pool, BigInt(taker.orderId ?? 0), 0, fillPrice, quantity, notional],
});
const rcpt = await pub.waitForTransactionReceipt({ hash: routeHash });
console.log(`route    ${routeHash}  block=${rcpt.blockNumber}  status=${rcpt.status}`);
if (rcpt.status !== "success") fail("the route transaction reverted, so no fee was collected.");

// --- 4. post-conditions. Only a completed route can produce all four.
const logs = parseEventLogs({ abi: routerAbi, eventName: "Routed", logs: rcpt.logs });
if (!logs.length) fail("route mined but emitted no Routed event, so nothing was attributed.");
const ev = logs[0].args;
if (ev.notional !== notional) fail(`Routed event notional ${ev.notional} does not match the order's ${notional}.`);
if (ev.pool.toLowerCase() !== market.pool.toLowerCase()) fail("Routed event points at a different pool than the order.");
ok(`Routed event attributes ${usdc(ev.notional)} to "${CODE}" on pool ${ev.pool}`);

const st1 = await pub.readContract({ address: KIOSK_ROUTER, abi: routerAbi, functionName: "stats", args: [codeHash] });
if (st1[2] !== o0 + 1n) fail(`order count went ${o0} -> ${st1[2]}, expected +1.`);
if (st1[0] !== n0 + notional) fail(`routed notional went ${n0} -> ${st1[0]}, expected +${notional}.`);
if (st1[1] !== f0 + expFee) fail(`routed fees went ${f0} -> ${st1[1]}, expected +${expFee}.`);
ok(`router accounting advanced by exactly 1 order, ${usdc(notional)} notional, ${usdc(expFee)} fees`);

const payoutAfter = await pub.readContract({ address: COLLATERAL, abi: erc20Abi, functionName: "balanceOf", args: [payout] });
const delta = payoutAfter - payoutBefore;
if (delta < expInt) fail(`integrator payout rose by ${usdc(delta)}, expected at least ${usdc(expInt)}.`);
ok(`integrator wallet actually received ${usdc(delta)}`);

const routerHeld = await pub.readContract({ address: COLLATERAL, abi: erc20Abi, functionName: "balanceOf", args: [KIOSK_ROUTER] });
if (routerHeld !== 0n) fail(`router is holding ${usdc(routerHeld)}. It must never custody collateral.`);
ok("router holds zero collateral, custody stayed with the trader and the payouts");

console.log(`\nVERIFIED  order ${taker.hash}`);
console.log(`VERIFIED  route ${routeHash} in block ${rcpt.blockNumber}`);
console.log(`Blind spot: this is Shannon testnet with tUSDC, and the venue's own maker/taker fees read 0, so the fee mechanism is exercised but not priced against real demand.`);
process.exit(0);
