"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

type Eip1193Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export type WalletPhase =
  | "detecting"
  | "absent"
  | "disconnected"
  | "connecting"
  | "wrong-network"
  | "connected";

type Status = "detecting" | "disconnected" | "connecting" | "connected";

const SOMNIA_SHANNON = {
  chainName: "Somnia Shannon Testnet",
  nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
  rpcUrls: ["https://dream-rpc.somnia.network"],
  blockExplorerUrls: ["https://shannon-explorer.somnia.network"],
};

/** An injected provider appears once, at load, and never unsubscribes. */
const noopSubscribe = () => () => {};
const readInjected = () => Boolean(window.ethereum);
const serverInjected = () => false;

export function useWallet(expectedChainId: number) {
  const hasProvider = useSyncExternalStore(noopSubscribe, readInjected, serverInjected);
  const [status, setStatus] = useState<Status>("detecting");
  const [address, setAddress] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sync = useCallback(async (provider: Eip1193Provider, accounts: string[]) => {
    if (!accounts.length) {
      setAddress(null);
      setStatus("disconnected");
      return;
    }
    setAddress(accounts[0]);
    const hex = (await provider.request({ method: "eth_chainId" })) as string;
    setChainId(Number.parseInt(hex, 16));
    setStatus("connected");
  }, []);

  useEffect(() => {
    if (!hasProvider) return;
    const provider = window.ethereum;
    if (!provider) return;
    let live = true;

    provider
      .request({ method: "eth_accounts" })
      .then((a) => {
        if (live) void sync(provider, a as string[]);
      })
      .catch(() => {
        if (live) setStatus("disconnected");
      });

    const onAccounts = (...args: never[]) => {
      void sync(provider, (args[0] ?? []) as string[]);
    };
    const onChain = (...args: never[]) => {
      setChainId(Number.parseInt(args[0] as string, 16));
    };
    provider.on?.("accountsChanged", onAccounts);
    provider.on?.("chainChanged", onChain);
    return () => {
      live = false;
      provider.removeListener?.("accountsChanged", onAccounts);
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [hasProvider, sync]);

  const connect = useCallback(async () => {
    const provider = window.ethereum;
    if (!provider) return;
    setError(null);
    setStatus("connecting");
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      await sync(provider, accounts);
    } catch (err) {
      const e = err as { code?: number; message?: string };
      setError(e.code === 4001 ? "Connection request dismissed in the wallet." : (e.message ?? "Could not connect."));
      setStatus("disconnected");
    }
  }, [sync]);

  const switchNetwork = useCallback(async () => {
    const provider = window.ethereum;
    if (!provider) return;
    const hexId = `0x${expectedChainId.toString(16)}`;
    setError(null);
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
    } catch (err) {
      const e = err as { code?: number; message?: string };
      if (e.code === 4902 || e.code === -32603) {
        try {
          await provider.request({
            method: "wallet_addEthereumChain",
            params: [{ chainId: hexId, ...SOMNIA_SHANNON }],
          });
        } catch (addErr) {
          setError((addErr as { message?: string }).message ?? "Could not add Somnia Shannon to the wallet.");
        }
      } else {
        setError(e.message ?? "Network switch dismissed.");
      }
    }
  }, [expectedChainId]);

  const phase: WalletPhase = !hasProvider
    ? "absent"
    : status === "connected" && chainId !== expectedChainId
      ? "wrong-network"
      : status;

  return { phase, address, chainId, error, connect, switchNetwork };
}
