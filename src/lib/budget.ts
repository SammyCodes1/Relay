import { formatUsdc, minBig } from "./money"

/** 40% of the user budget stays reserved for hop B. */
export const HOP_B_FLOOR_BPS = 4000n
const BPS = 10000n

export interface Ledger {
  accepted: bigint
  held: bigint
}

export function emptyLedger(): Ledger {
  return { accepted: 0n, held: 0n }
}

export function hopBFloor(budget: bigint, bps = HOP_B_FLOOR_BPS): bigint {
  return (budget * bps) / BPS
}

export function hopAMax(budget: bigint, bps = HOP_B_FLOOR_BPS): bigint {
  return budget - hopBFloor(budget, bps)
}

export function assertSplit(budget: bigint): { floor: bigint; hopAMax: bigint } {
  const floor = hopBFloor(budget)
  const maxA = budget - floor
  if (floor <= 0n || maxA <= 0n || maxA >= budget) {
    throw new Error("Budget is too small to reserve a hop B floor and a hop A max")
  }
  return { floor, hopAMax: maxA }
}

export function remainingOf(budget: bigint, accepted: bigint, held: bigint): bigint {
  const left = budget - accepted - held
  return left > 0n ? left : 0n
}

export function hold(state: Ledger, amount: bigint): Ledger {
  if (amount <= 0n) throw new Error("Hold must be positive")
  return { accepted: state.accepted, held: state.held + amount }
}

export function settle(state: Ledger, amount: bigint): Ledger {
  if (amount <= 0n || amount > state.held) throw new Error("Settle amount is not held")
  return { accepted: state.accepted + amount, held: state.held - amount }
}

export function release(state: Ledger, amount: bigint): Ledger {
  if (amount <= 0n || amount > state.held) throw new Error("Release amount is not held")
  return { accepted: state.accepted, held: state.held - amount }
}

export type QuoteDecision =
  | { kind: "accept"; price: bigint; counter: null; reason: null; charge: bigint }
  | { kind: "counter_accept"; price: bigint; counter: bigint; reason: string; charge: bigint }
  | { kind: "walk_away"; price: null; counter: bigint; reason: string; charge: 0n }

/**
 * One counter, then accept or walk away.
 * A live direct hire has a fixed price, so a counter is recorded and the hop walks away.
 * A demo seller may accept the counter. Nothing is charged on a walk-away.
 */
export function evaluateQuote(input: {
  quote: bigint
  plannedMax: bigint
  remaining: bigint
  liveFixedPrice: boolean
  sellerAcceptsCounter: boolean
}): QuoteDecision {
  const ceiling = minBig(input.plannedMax, input.remaining)
  if (input.quote > 0n && input.quote <= ceiling) {
    return { kind: "accept", price: input.quote, counter: null, reason: null, charge: input.quote }
  }
  const reason = `Quote ${formatUsdc(input.quote)} USDC is above the planned max, so this hop counters once at ${formatUsdc(ceiling)} USDC.`
  if (!input.liveFixedPrice && input.sellerAcceptsCounter && ceiling > 0n && ceiling < input.quote) {
    return { kind: "counter_accept", price: ceiling, counter: ceiling, reason, charge: ceiling }
  }
  return { kind: "walk_away", price: null, counter: ceiling, reason, charge: 0n }
}
