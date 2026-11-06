"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { parseUsdcLoose } from "../../../lib/money";
import { connectMainnetWallet, readUsdcBalance, restoreMainnetWallet, signUsdcTransfer, subscribeWallet } from "../../near-wallet";

interface Hop {
  role: string;
  handle: string;
  seller: string;
  state: string;
  quote: string | null;
  counter: string | null;
  counterReason: string | null;
  price: string | null;
  plannedMax: string;
  approvalUrl: string | null;
  jobUrl: string | null;
  marketUrl: string | null;
  error: string | null;
  quality: string | null;
  successfulPaidHire: boolean;
  deliverable: string | null;
}

interface Run {
  id: string;
  mode: "demo" | "live";
  status: string;
  task: string;
  budget: string;
  remaining: string;
  held: string;
  accepted: string;
  hopBFloor: string;
  hopAMax: string;
  confirmHop: "A" | "B" | null;
  acceptReady: boolean;
  payMode: string;
  error: string | null;
  rejectedInstructions: string[];
  hops: { A: Hop; B: Hop };
  receipts: Array<{ id: string; hop: string; outcome: string; successfulPaidHire: boolean }>;
}

export default function RunPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState("");
  const [walletAccount, setWalletAccount] = useState("");
  const [walletLabel, setWalletLabel] = useState("");
  const [walletBalance, setWalletBalance] = useState("");
  const [walletBusy, setWalletBusy] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeWallet((account, label) => {
      setWalletAccount(account ?? "");
      setWalletLabel(label ?? "");
    });
    void restoreMainnetWallet();
    return unsubscribe;
  }, []);

  useEffect(() => {
    let stop = false;
    async function pull() {
      if (stop) return;
      const current = await fetch(`/api/runs/${params.id}`).then((response) => response.json());
      if (stop) return;
      if (current.error && !current.id) setError(current.error);
      else setRun(current);
      if (current.mode === "live" && current.status !== "completed" && current.status !== "walked_away" && current.status !== "failed") {
        await fetch("/api/live/tick", { method: "POST" });
      }
    }
    void pull();
    const timer = setInterval(() => void pull(), 3000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [params.id]);

  async function payFromWallet(hop: "A" | "B") {
    setWalletBusy(true);
    setError("");
    try {
      const account = walletAccount || await connectMainnetWallet();
      setWalletAccount(account);
      const challenge = await fetch(`/api/runs/${params.id}/wallet`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hop }),
      });
      const quoted = await challenge.json();
      if (!challenge.ok) throw new Error(quoted.error ?? "Could not quote the wallet payment");
      const row = quoted.row as { asset: string; payTo: string; amount: string; maxTimeoutSeconds: number };
      const balance = await readUsdcBalance(row.asset, account);
      setWalletBalance(balance);
      if (parseUsdcLoose(balance) < BigInt(row.amount)) {
        throw new Error(`Wallet USDC ${balance} does not cover this hire. Nothing was signed.`);
      }
      const signed = await signUsdcTransfer(row);
      const response = await fetch(`/api/runs/${params.id}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hop, signedDelegateAction: signed }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Wallet payment failed");
      setRun(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Wallet payment failed");
    } finally {
      setWalletBusy(false);
    }
  }

  async function confirm(hop: "A" | "B" | "accept") {
    setError("");
    const response = await fetch(`/api/runs/${params.id}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ hop }),
    });
    const body = await response.json();
    if (!response.ok) setError(body.error ?? "Confirm failed");
    else setRun(body);
  }

  function goBack() {
    if (window.history.length > 1) router.back();
    else router.push("/start");
  }

  if (!run) {
    return (
      <div className="grid gap-4">
        <button type="button" onClick={goBack} className="btn-line w-fit gap-2" aria-label="Back">
          <Arrow />
          Back
        </button>
        <div className="skeleton h-8 w-40 rounded-full" />
        <div className="skeleton h-16 w-full max-w-xl rounded-2xl" />
        <div className="skeleton h-40 w-full rounded-[2rem]" />
        {error && <p className="text-sm text-[var(--clay)]">{error}</p>}
      </div>
    );
  }

  const active = run.confirmHop ? run.hops[run.confirmHop] : null;
  const steps = [
    { index: "01", name: "Planner", detail: `Keeps ${run.hopBFloor} USDC for the finisher`, state: run.status },
    { index: "02", name: "Specialist", detail: run.hops.A.handle, state: run.hops.A.state },
    { index: "03", name: "Finisher", detail: run.hops.B.handle, state: run.hops.B.state },
  ];

  return (
    <div className="grid gap-10">
      <button type="button" onClick={goBack} className="btn-line w-fit gap-2" aria-label="Back">
        <Arrow />
        Back
      </button>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className={`mono inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-[12px] uppercase tracking-[0.14em] ${run.mode === "live" ? "bg-[var(--ink)] text-[var(--cream)]" : "border border-[var(--line)]"}`}>
            {run.mode === "live" && <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--cream)]" />}
            {run.mode === "live" ? "Live payment" : "Demo — no money moves"}
          </p>
          <h1 className="mt-4 text-[clamp(2rem,4vw,3.2rem)] leading-none tracking-tight">Run</h1>
        </div>
        <p className="mono text-right">
          <span className="block text-[12px] uppercase tracking-[0.14em] text-[var(--muted)]">Remaining</span>
          <span className="text-3xl tracking-tight">{run.remaining}</span>
          <span className="ml-2 text-sm text-[var(--muted)]">USDC</span>
        </p>
      </div>
      <p className="max-w-[40rem] leading-relaxed text-[var(--muted)]">{run.task}</p>
      <dl className="grid gap-px overflow-hidden rounded-[1.5rem] bg-[var(--line)] sm:grid-cols-4">
        <Stat label="Budget" value={run.budget} />
        <Stat label="Hop A max" value={run.hopAMax} />
        <Stat label="Hop B floor" value={run.hopBFloor} />
        <Stat label="Held / accepted" value={`${run.held} / ${run.accepted}`} />
      </dl>
      <ol className="border-t border-[var(--line)]">
        {steps.map((step) => (
          <li key={step.index} className="grid gap-2 border-b border-[var(--line)] py-4 sm:grid-cols-[4rem_10rem_1fr_auto] sm:items-baseline">
            <span className="mono text-[12px] text-[var(--muted)]">{step.index}</span>
            <span>{step.name}</span>
            <span className="text-[var(--muted)]">{step.detail}</span>
            <span className="mono text-sm">{step.state}</span>
          </li>
        ))}
      </ol>
      {active && run.mode === "live" && (
        <section className="rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-2xl tracking-tight">Confirm payment</h2>
            <p className="mono text-sm text-[var(--muted)]">{active.handle}</p>
          </div>
          <dl className="mt-6 grid grid-cols-3 gap-4 border-y border-[var(--line)] py-4">
            <div>
              <dt className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">Quote</dt>
              <dd className="mt-1 text-lg">{active.quote}</dd>
            </div>
            <div>
              <dt className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">Max</dt>
              <dd className="mt-1 text-lg">{active.plannedMax}</dd>
            </div>
            <div>
              <dt className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">Left</dt>
              <dd className="mt-1 text-lg">{run.remaining}</dd>
            </div>
          </dl>
          {active.counter && <p className="mt-4 text-sm text-[var(--muted)]">Counter {active.counter} USDC. {active.counterReason}</p>}
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {run.payMode !== "x402" && (
              <button className="btn" type="button" onClick={() => void confirm(run.confirmHop!)}>
                Marketplace
              </button>
            )}
            <button className="btn-line" type="button" disabled={walletBusy} onClick={() => void payFromWallet(run.confirmHop!)}>
              {walletBusy ? "Waiting for the wallet" : "Wallet"}
            </button>
          </div>
          <p className="mono mt-4 text-sm text-[var(--muted)]">
            {walletAccount
              ? `${walletLabel || "Wallet"} · ${walletAccount.length > 18 ? `${walletAccount.slice(0, 6)}…${walletAccount.slice(-4)}` : walletAccount}${walletBalance ? ` · ${walletBalance} USDC` : ""}`
              : "Wallet pays from the connected account."}
          </p>
        </section>
      )}
      {run.acceptReady && (
        <section className="grid gap-3 rounded-[2rem] border border-[var(--line)] p-6">
          <h2 className="text-2xl tracking-tight">Confirm acceptance</h2>
          <p className="max-w-[40rem] text-[var(--muted)]">The quality check passed. Accepting releases the held payments on /mcp/pro.</p>
          <button className="btn min-h-11 w-fit rounded-full px-5 text-sm" type="button" onClick={() => void confirm("accept")}>
            Confirm acceptance
          </button>
        </section>
      )}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <HopCard title="Specialist" hop={run.hops.A} />
        <HopCard title="Finisher" hop={run.hops.B} />
      </div>
      {run.rejectedInstructions.length > 0 && (
        <p className="text-sm text-[var(--clay)]">Ignored as instructions: {run.rejectedInstructions.join(", ")}.</p>
      )}
      {(error || run.error) && <p className="text-sm text-[var(--clay)]">{error || run.error}</p>}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {run.receipts.map((receipt) => (
          <Link key={receipt.id} className="underline decoration-[var(--line)] underline-offset-4" href={`/receipts/${receipt.id}`}>
            Hop {receipt.hop}: {receipt.outcome}{receipt.successfulPaidHire ? "" : " (not a successful hire)"}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
      <path d="M10 3.5 5.5 8 10 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--surface)] px-4 py-3">
      <dt className="mono text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">{label}</dt>
      <dd className="mono mt-1 text-lg">{value}</dd>
    </div>
  );
}

function HopCard({ title, hop }: { title: string; hop: Hop }) {
  return (
    <section className="grid gap-2 border-t border-[var(--ink)] pt-4 text-sm">
      <h2 className="text-2xl tracking-tight">{title}</h2>
      <p>{hop.seller} · <span className="mono">{hop.handle}</span></p>
      <p className="text-[var(--muted)]">State {hop.state}. Quote {hop.quote ?? "—"}. Price {hop.price ?? "—"}.</p>
      {hop.counterReason && <p>{hop.counterReason}</p>}
      {hop.quality && <p>Quality {hop.quality}. Successful paid hire: {hop.successfulPaidHire ? "yes" : "no"}.</p>}
      {hop.approvalUrl && <a className="underline underline-offset-4" href={hop.approvalUrl}>Open Agent Market approval</a>}
      {hop.jobUrl && <a className="underline underline-offset-4" href={hop.jobUrl}>Job</a>}
      {hop.marketUrl && <a className="underline underline-offset-4" href={hop.marketUrl}>Agent host</a>}
      {hop.error && <p className="text-[var(--clay)]">{hop.error}</p>}
      {hop.deliverable && <pre className="mono mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-2xl bg-[var(--surface)] p-4 text-[13px] leading-relaxed">{hop.deliverable}</pre>}
    </section>
  );
}
