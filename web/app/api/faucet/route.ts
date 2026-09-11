import { createWalletClient, http, isAddress, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { somniaTestnet } from "viem/chains";
import { erc20Abi } from "@/lib/abi";
import { COLLATERAL, formatUnits6, publicClient, suggestedFees } from "@/lib/kiosk";

/**
 * POST /api/faucet  { "address": "0x..." }
 *
 * Drips enough tUSDC and STT for a visitor with an empty wallet to place one
 * real order through the widget. The key lives only in PRIVATE_KEY on the
 * server; it is never read from a NEXT_PUBLIC_ var, never returned, and never
 * logged. Only the faucet's own address is ever disclosed.
 *
 * Refusals, in order: no key configured, malformed address, address already
 * funded, per-address cooldown, per-IP hourly cap, process-wide hourly cap,
 * faucet out of funds.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;

const NO_STORE = {
  "cache-control": "no-store, no-cache, must-revalidate",
  "content-type": "application/json",
} as const;

/** Fixed drip. One order escrows a few tUSDC, and Somnia gas is ~6 gwei. */
const USDC_DRIP = BigInt(25_000_000); // 25 tUSDC
const STT_DRIP = BigInt(5) * BigInt(10) ** BigInt(17); // 0.5 STT

/** Already-funded thresholds: above these the wallet can trade unaided. */
const USDC_ENOUGH = BigInt(10_000_000); // 10 tUSDC
const STT_ENOUGH = BigInt(10) ** BigInt(17); // 0.1 STT

const ADDRESS_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const IP_WINDOW_MS = 60 * 60 * 1000;
const IP_MAX_PER_WINDOW = 3;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;
const GLOBAL_MAX_PER_WINDOW = 40;

/**
 * In-memory limiter. Per-process by design: a serverless instance that recycles
 * loses its history, and the on-chain balance check is the second gate that
 * still refuses an address that already holds enough.
 */
const lastClaimByAddress = new Map<string, number>();
const claimsByIp = new Map<string, number[]>();
let globalClaims: number[] = [];

/** One drip at a time, so two concurrent requests cannot reuse a nonce. */
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function prune(times: number[], windowMs: number, now: number): number[] {
  return times.filter((t) => now - t < windowMs);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: NO_STORE });
}

export async function POST(request: Request) {
  const key = process.env.PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    return json(
      {
        error: "faucet not configured",
        detail:
          "PRIVATE_KEY is not set on the server, so there is no funded account to drip from. " +
          "Fund a Shannon key and set PRIVATE_KEY (never NEXT_PUBLIC_).",
      },
      503,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad request", detail: "Body must be JSON." }, 400);
  }
  const raw = (body as { address?: unknown })?.address;
  if (typeof raw !== "string" || !isAddress(raw)) {
    return json({ error: "bad address", detail: "Pass { address: \"0x...\" }." }, 400);
  }
  const to = raw as Address;
  const addressKey = to.toLowerCase();

  const now = Date.now();
  const last = lastClaimByAddress.get(addressKey);
  if (last && now - last < ADDRESS_COOLDOWN_MS) {
    const mins = Math.ceil((ADDRESS_COOLDOWN_MS - (now - last)) / 60_000);
    return json(
      { error: "rate limited", detail: `This address already claimed. Try again in ${mins} min.` },
      429,
    );
  }

  const ip = clientIp(request);
  const ipTimes = prune(claimsByIp.get(ip) ?? [], IP_WINDOW_MS, now);
  if (ipTimes.length >= IP_MAX_PER_WINDOW) {
    return json(
      { error: "rate limited", detail: `Up to ${IP_MAX_PER_WINDOW} claims per hour per IP.` },
      429,
    );
  }

  globalClaims = prune(globalClaims, GLOBAL_WINDOW_MS, now);
  if (globalClaims.length >= GLOBAL_MAX_PER_WINDOW) {
    return json(
      { error: "faucet cooling down", detail: "The hourly faucet cap is reached. Try again later." },
      429,
    );
  }

  const account = privateKeyToAccount(key as `0x${string}`);

  try {
    const [usdcHeld, sttHeld] = await Promise.all([
      publicClient.readContract({
        address: COLLATERAL,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [to],
      }),
      publicClient.getBalance({ address: to }),
    ]);

    const needsUsdc = usdcHeld < USDC_ENOUGH;
    const needsStt = sttHeld < STT_ENOUGH;
    if (!needsUsdc && !needsStt) {
      return json(
        {
          error: "already funded",
          detail:
            `This wallet holds ${formatUnits6(usdcHeld)} tUSDC and ` +
            `${Number(sttHeld) / 1e18} STT, enough to trade. Nothing sent.`,
          tusdc: usdcHeld.toString(),
          stt: sttHeld.toString(),
        },
        409,
      );
    }

    const [faucetUsdc, faucetStt] = await Promise.all([
      publicClient.readContract({
        address: COLLATERAL,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account.address],
      }),
      publicClient.getBalance({ address: account.address }),
    ]);
    if (needsUsdc && faucetUsdc < USDC_DRIP) {
      return json(
        {
          error: "faucet empty",
          detail: `The faucet holds ${formatUnits6(faucetUsdc)} tUSDC, below one drip.`,
          faucet: account.address,
        },
        503,
      );
    }
    if (needsStt && faucetStt < STT_DRIP * BigInt(2)) {
      return json(
        {
          error: "faucet empty",
          detail: "The faucet is out of STT for gas.",
          faucet: account.address,
        },
        503,
      );
    }

    const wallet = createWalletClient({
      account,
      chain: somniaTestnet,
      transport: http(
        process.env.NEXT_PUBLIC_SOMNIA_RPC_URL ||
          process.env.RPC_URL ||
          somniaTestnet.rpcUrls.default.http[0],
      ),
    });

    const result = await serialize(async () => {
      const fees = await suggestedFees();
      let usdcHash: `0x${string}` | null = null;
      let sttHash: `0x${string}` | null = null;

      if (needsUsdc) {
        // Somnia prices state creation aggressively, so the limit comes from a
        // real estimate against this recipient, not an Ethereum constant.
        const gas = await publicClient.estimateContractGas({
          account,
          address: COLLATERAL,
          abi: erc20Abi,
          functionName: "transfer",
          args: [to, USDC_DRIP],
        });
        usdcHash = await wallet.writeContract({
          address: COLLATERAL,
          abi: erc20Abi,
          functionName: "transfer",
          args: [to, USDC_DRIP],
          gas: (gas * BigInt(13)) / BigInt(10),
          ...fees,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: usdcHash });
        if (receipt.status !== "success") {
          throw new Error(`tUSDC transfer reverted (${usdcHash})`);
        }
      }

      if (needsStt) {
        const gas = await publicClient.estimateGas({
          account,
          to,
          value: STT_DRIP,
        });
        sttHash = await wallet.sendTransaction({
          to,
          value: STT_DRIP,
          gas: (gas * BigInt(13)) / BigInt(10),
          ...fees,
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash: sttHash });
        if (receipt.status !== "success") {
          throw new Error(`STT transfer reverted (${sttHash})`);
        }
      }

      return { usdcHash, sttHash };
    });

    lastClaimByAddress.set(addressKey, now);
    claimsByIp.set(ip, [...ipTimes, now]);
    globalClaims.push(now);

    return json(
      {
        ok: true,
        chainId: 50312,
        to,
        faucet: account.address,
        sent: {
          tusdc: needsUsdc ? USDC_DRIP.toString() : "0",
          tusdcDisplay: needsUsdc ? formatUnits6(USDC_DRIP) : "0",
          stt: needsStt ? STT_DRIP.toString() : "0",
          sttDisplay: needsStt ? "0.5" : "0",
        },
        tx: result,
      },
      200,
    );
  } catch (err) {
    // The message can carry call data but never the key: nothing here ever puts
    // PRIVATE_KEY into a string.
    return json(
      { error: "drip failed", detail: err instanceof Error ? err.message : String(err) },
      502,
    );
  }
}
