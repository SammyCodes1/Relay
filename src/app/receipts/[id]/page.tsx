"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

interface Receipt {
  id: string;
  runId: string;
  hop: string;
  seller: string;
  handle: string;
  brief: string;
  quote: string;
  counter: string | null;
  counterReason: string | null;
  price: string | null;
  paymentMethod: string;
  outcome: string;
  successfulPaidHire: boolean;
  marketUrl: string | null;
  jobUrl: string | null;
  mode: string;
  parentReceiptId: string | null;
  parentHash: string | null;
  hash: string;
}

export default function ReceiptPage() {
  const params = useParams<{ id: string }>();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/receipts/${params.id}`).then(async (response) => {
      const body = await response.json();
      if (!response.ok) setError(body.error ?? "Missing receipt");
      else setReceipt(body.receipt);
    });
  }, [params.id]);

  if (!receipt) {
    return (
      <div className="grid max-w-3xl gap-3">
        <Link href="/receipts" className="btn-line w-fit">Back</Link>
        <div className="skeleton h-8 w-28 rounded-full" />
        <div className="skeleton h-12 w-2/3 rounded-2xl" />
        <div className="skeleton h-40 rounded-[2rem]" />
        {error && <p className="text-sm text-[var(--clay)]">{error}</p>}
      </div>
    );
  }

  return (
    <article className="grid max-w-3xl gap-6">
      <Link href="/receipts" className="btn-line w-fit">Back</Link>
      <p className={`mono inline-flex w-fit items-center gap-2 rounded-full px-3 py-2 text-[12px] uppercase tracking-[0.14em] ${receipt.mode === "live" ? "bg-[var(--ink)] text-[var(--cream)]" : "border border-[var(--line)]"}`}>
        {receipt.mode === "live" && <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-[var(--cream)]" />}
        {receipt.mode === "live" ? "Live" : "Demo — no money moved"}
      </p>
      <div>
        <h1 className="text-[clamp(2rem,4vw,3.4rem)] leading-none tracking-tight">{receipt.seller}</h1>
        <p className="mt-3 text-[var(--muted)]">
          <span className="mono">{receipt.handle}</span> · hop {receipt.hop} · {receipt.outcome}. {receipt.successfulPaidHire ? "Successful paid hire." : "Not a successful paid hire."}
        </p>
      </div>
      <dl className="border-t border-[var(--line)]">
        <Row label="Quote" value={`${receipt.quote} USDC`} />
        <Row label="Counter" value={receipt.counter ? `${receipt.counter} USDC` : "none"} />
        <Row label="Reason" value={receipt.counterReason ?? "—"} />
        <Row label="Price" value={receipt.price ? `${receipt.price} USDC` : "nothing kept"} />
        <Row label="Payment" value={receipt.paymentMethod} />
        <Row label="Hash" value={receipt.hash} />
        <Row label="Parent hash" value={receipt.parentHash ?? "—"} />
      </dl>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {receipt.parentReceiptId && <Link className="underline underline-offset-4" href={`/receipts/${receipt.parentReceiptId}`}>Parent receipt</Link>}
        {receipt.marketUrl && <a className="underline underline-offset-4" href={receipt.marketUrl}>Agent host</a>}
        {receipt.jobUrl && <a className="underline underline-offset-4" href={receipt.jobUrl}>Market job</a>}
        <Link className="underline underline-offset-4" href={`/runs/${receipt.runId}`}>Back to the run</Link>
      </div>
      <h2 className="text-2xl tracking-tight">Brief</h2>
      <pre className="mono whitespace-pre-wrap rounded-[1.5rem] bg-[var(--surface)] p-5 text-[13px] leading-relaxed">{receipt.brief}</pre>
    </article>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 border-b border-[var(--line)] py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
      <dt className="mono text-[12px] uppercase tracking-[0.12em] text-[var(--muted)]">{label}</dt>
      <dd className="break-all">{value}</dd>
    </div>
  );
}
