"use client";

import { useEffect, useState } from "react";
import { connectMainnetWallet, disconnectMainnetWallet, restoreMainnetWallet, subscribeWallet } from "./near-wallet";

function shortAccount(accountId: string) {
  if (accountId.length <= 22) return accountId;
  return `${accountId.slice(0, 8)}…${accountId.slice(-8)}`;
}

export function WalletConnect() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [walletLabel, setWalletLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = subscribeWallet((account, label) => {
      setAccountId(account);
      setWalletLabel(label);
    });
    void restoreMainnetWallet().catch(() => undefined);
    return unsubscribe;
  }, []);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      await connectMainnetWallet();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Wallet connection failed");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      await disconnectMainnetWallet();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not disconnect");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {accountId ? (
        <button type="button" className="btn-line max-w-[16rem]" disabled={busy} onClick={() => void disconnect()} title={accountId}>
          <span className="truncate">{walletLabel ? `${walletLabel} · ` : ""}{shortAccount(accountId)}</span>
        </button>
      ) : (
        <button type="button" className="btn" disabled={busy} onClick={() => void connect()}>
          {busy ? "Opening wallets" : "Connect wallet"}
        </button>
      )}
      {error && <span className="max-w-[14rem] text-xs leading-snug text-[var(--clay)]">{error}</span>}
    </div>
  );
}
