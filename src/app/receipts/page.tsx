"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Receipt {
  id: string;
  runId: string;
  hop: string;
  seller: string;
  handle: string;
  quote: string;
  counter: string | null;
  price: string | null;
  paymentMethod: string;
  outcome: string;
  successfulPaidHire: boolean;
  mode: string;
  parentReceiptId: string | null;
}

export default function ReceiptsPage() {
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);

  useEffect(() => {
    fetch("/api/receipts").then((response) => response.json()).then((body) => setReceipts(body.receipts ?? []));
  }, []);

  return (
    <div className="grid gap-8">
      <Link href="/" className="btn-line w-fit">Back</Link>
      <div className="max-w-[40rem]">
        <p className="mono text-[12px] uppercase tracking-[0.18em] text-[var(--muted)]">Public chain</p>
        <h1 className="mt-3 text-[clamp(2.2rem,4vw,3.6rem)] leading-none tracking-tight">Receipts</h1>
        <p className="mt-4 leading-relaxed text-[var(--muted)]">Each finisher receipt names its specialist receipt. A demo row is not a live payment.</p>
      </div>
      {receipts === null && (
        <div className="grid gap-3">
          <div className="skeleton h-20 rounded-2xl" />
          <div className="skeleton h-20 rounded-2xl" />
        </div>
      )}
      {receipts?.length === 0 && (
        <div className="max-w-md border-t border-[var(--ink)] pt-6">
          <p className="text-xl tracking-tight">No chain yet.</p>
          <p className="mt-2 text-[var(--muted)]">Start a demo run. The specialist receipt and the finisher receipt will land here, linked by hash.</p>
          <Link className="mt-4 inline-flex min-h-11 items-center underline underline-offset-4" href="/start">Start a run</Link>
        </div>
      )}
      <ul className="border-t border-[var(--line)]">
        {receipts?.map((receipt) => (
          <li key={receipt.id} className="grid gap-2 border-b border-[var(--line)] py-5 sm:grid-cols-[1fr_auto] sm:items-baseline">
            <div>
              <Link href={`/receipts/${receipt.id}`} className="text-xl tracking-tight underline decoration-[var(--line)] underline-offset-4">{receipt.seller}</Link>
              <p className="mono mt-1 text-[12px] uppercase tracking-[0.12em] text-[var(--muted)]">
                {receipt.mode} · hop {receipt.hop} · {receipt.paymentMethod} · {receipt.outcome}
              </p>
            </div>
            <p className="mono text-sm">
              {receipt.quote} quote{receipt.counter ? ` · ${receipt.counter} counter` : ""} · {receipt.price ?? "—"} kept
              <span className="mt-1 block text-[var(--muted)]">{receipt.successfulPaidHire ? "successful hire" : "not a successful hire"}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
