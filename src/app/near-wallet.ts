"use client";

import { formatUsdc } from "../lib/money";

const options = {
  network: "mainnet" as const,
  footerBranding: {
    heading: "Relay",
    linkText: "Back to Relay",
  },
};

type WalletListener = (accountId: string | null, walletLabel: string | null) => void;
const listeners = new Set<WalletListener>();
let watching = false;

async function walletApi() {
  return import("@fastnear/wallet");
}

function emit(accountId: string | null, walletLabel: string | null) {
  for (const listener of listeners) listener(accountId, walletLabel);
}

async function watch() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  const wallet = await walletApi();
  wallet.onConnect((result) => {
    emit(result.accountId, wallet.walletName(options));
  });
  wallet.onDisconnect(() => emit(null, null));
}

export function subscribeWallet(listener: WalletListener) {
  listeners.add(listener);
  void watch();
  return () => {
    listeners.delete(listener);
  };
}

export async function restoreMainnetWallet() {
  const wallet = await walletApi();
  const restored = await wallet.restore(options);
  if (!restored?.accountId) return null;
  const label = wallet.walletName(options);
  emit(restored.accountId, label);
  return { accountId: restored.accountId, walletLabel: label };
}

export async function connectMainnetWallet(): Promise<string> {
  const wallet = await walletApi();
  if (wallet.isConnected(options) && wallet.accountId(options)) return wallet.accountId(options) as string;
  const restored = await wallet.restore(options);
  if (restored?.accountId) {
    emit(restored.accountId, wallet.walletName(options));
    return restored.accountId;
  }
  const connected = await wallet.connect({
    ...options,
    footerBranding: { ...options.footerBranding, link: window.location.origin },
  });
  if (!connected?.accountId) throw new Error("Wallet connection was cancelled");
  emit(connected.accountId, wallet.walletName(options));
  return connected.accountId;
}

export async function disconnectMainnetWallet() {
  const wallet = await walletApi();
  await wallet.disconnect(options);
  emit(null, null);
}

export async function readUsdcBalance(asset: string, account: string): Promise<string> {
  const args = btoa(JSON.stringify({ account_id: account }));
  const response = await fetch("https://rpc.mainnet.fastnear.com", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "relay",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: asset,
        method_name: "ft_balance_of",
        args_base64: args,
      },
    }),
  });
  const body = await response.json();
  const bytes = body?.result?.result;
  if (!Array.isArray(bytes)) throw new Error("Could not read the wallet USDC balance");
  const text = JSON.parse(new TextDecoder().decode(new Uint8Array(bytes))) as string;
  return formatUsdc(BigInt(text));
}

function signedDelegateBase64(value: unknown): string {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && "borshSerializedBase64" in value && typeof value.borshSerializedBase64 === "string") {
    return value.borshSerializedBase64;
  }
  throw new Error("The wallet did not return a signed payment");
}

async function signDelegate(row: { asset: string; payTo: string; amount: string; maxTimeoutSeconds?: number }) {
  const wallet = await import("@fastnear/wallet");
  const action = {
    type: "FunctionCall" as const,
    params: {
      methodName: "ft_transfer",
      args: { receiver_id: row.payTo, amount: row.amount },
      gas: "30000000000000",
      deposit: "1",
    },
  };
  const signed = await wallet.signDelegateActions({
    network: "mainnet",
    delegateActions: [{
      receiverId: row.asset,
      ...(row.maxTimeoutSeconds ? { blockHeightTtl: row.maxTimeoutSeconds } : {}),
      actions: [action],
    }],
  });
  return signedDelegateBase64(signed.signedDelegateActions?.[0]);
}

export async function signUsdcTransfer(row: { asset: string; payTo: string; amount: string; maxTimeoutSeconds: number }): Promise<string> {
  try {
    return await signDelegate(row);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("signDelegateActionsWithTtl")) {
      return signDelegate({ asset: row.asset, payTo: row.payTo, amount: row.amount });
    }
    if (message.includes("does not support signDelegateActions")) {
      throw new Error("This wallet can connect, but it cannot sign an Agent Market payment. Meteor Wallet and Intear Wallet can. Nothing was signed.");
    }
    throw error;
  }
}
