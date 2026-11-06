import { describe, expect, it } from "vitest";
import { assertSplit, evaluateQuote, hold, release, remainingOf, settle } from "../src/lib/budget";
import { formatUsdc, parseUsdc } from "../src/lib/money";
import { receiptOutcome } from "../src/lib/quality";
import { SpecialistSelfCompleteError, specialistDeliverable } from "../src/lib/deliverables";

const budget = parseUsdc("1.00");

describe("budget", () => {
  it("reserves 40 percent for hop B and keeps hop A below the whole budget", () => {
    const split = assertSplit(budget);
    expect(formatUsdc(split.floor)).toBe("0.40");
    expect(formatUsdc(split.hopAMax)).toBe("0.60");
    expect(split.hopAMax + split.floor).toBe(budget);
    expect(split.hopAMax < budget).toBe(true);
  });

  it("subtracts accepted and held payments from the remaining budget", () => {
    expect(remainingOf(budget, parseUsdc("0.20"), parseUsdc("0.30"))).toBe(parseUsdc("0.50"));
  });

  it("moves a hold to accepted or releases it", () => {
    const held = hold({ accepted: 0n, held: 0n }, parseUsdc("0.25"));
    expect(settle(held, parseUsdc("0.25"))).toEqual({ accepted: parseUsdc("0.25"), held: 0n });
    expect(release(held, parseUsdc("0.25"))).toEqual({ accepted: 0n, held: 0n });
  });

  it("counters once, then accepts the counter or walks away with no charge", () => {
    const over = evaluateQuote({
      quote: parseUsdc("0.80"),
      plannedMax: parseUsdc("0.40"),
      remaining: parseUsdc("0.70"),
      liveFixedPrice: false,
      sellerAcceptsCounter: true,
    });
    expect(over.kind).toBe("counter_accept");
    if (over.kind !== "counter_accept") return;
    expect(over.counter).toBe(parseUsdc("0.40"));
    expect(over.charge).toBe(parseUsdc("0.40"));
    expect(over.reason.endsWith(".")).toBe(true);
    expect(over.reason.includes("counters once")).toBe(true);

    const walked = evaluateQuote({
      quote: budget,
      plannedMax: parseUsdc("0.60"),
      remaining: budget,
      liveFixedPrice: true,
      sellerAcceptsCounter: false,
    });
    expect(walked.kind).toBe("walk_away");
    expect(walked.charge).toBe(0n);
    expect(walked.counter).toBe(parseUsdc("0.60"));
  });

  it("does not mark a failed quality check as a successful paid hire", () => {
    expect(receiptOutcome({ walkedAway: false, qualityPass: false, settled: true })).toEqual({
      outcome: "quality_failed_settled",
      successfulPaidHire: false,
    });
    expect(receiptOutcome({ walkedAway: false, qualityPass: false, settled: false }).successfulPaidHire).toBe(false);
    expect(receiptOutcome({ walkedAway: true, qualityPass: null, settled: false }).outcome).toBe("walked_away");
  });

  it("refuses a specialist deliverable that has no finisher work", () => {
    expect(() => specialistDeliverable({ runId: "run", finisherHandle: "relay-finisher", finisherMarkdown: null })).toThrow(SpecialistSelfCompleteError);
    expect(() => specialistDeliverable({ runId: "run", finisherHandle: "relay-finisher", finisherMarkdown: "I did it myself" })).toThrow(SpecialistSelfCompleteError);
  });
});
