import { assertSplit, emptyLedger, evaluateQuote, hold, release, remainingOf, settle, type Ledger } from "./budget"
import { finisherDeliverable, specialistDeliverable } from "./deliverables"
import { findRejectedInstructions } from "./injection"
import { formatUsdc, parseUsdc } from "./money"
import { checkQuality, receiptOutcome } from "./quality"
import { blankHop, sealReceipt, type Hop, type PayMode, type Receipt, type Run, type Scenario } from "./types"

export interface QuoteView {
  seller: string
  price: bigint
  acceptsCounter: boolean
  liveFixedPrice: boolean
}

export interface RelayPort {
  quote(handle: string): Promise<QuoteView>
  hire(handle: string, price: bigint): Promise<{ ref: string; url: string | null }>
  submit(role: "specialist" | "finisher", markdown: string): Promise<void>
}

export function demoQuote(scenario: Scenario, role: "A" | "B", budget: bigint): QuoteView {
  const split = assertSplit(budget)
  if (role === "A") {
    if (scenario === "walkaway") {
      return { seller: "Demo specialist", price: budget, acceptsCounter: false, liveFixedPrice: true }
    }
    const price = split.hopAMax / 2n
    return { seller: "Demo specialist", price: price > 0n ? price : 1n, acceptsCounter: false, liveFixedPrice: false }
  }
  if (scenario === "counter") {
    return { seller: "Demo finisher", price: split.floor * 2n, acceptsCounter: true, liveFixedPrice: false }
  }
  const price = split.floor / 2n
  return { seller: "Demo finisher", price: price > 0n ? price : 1n, acceptsCounter: false, liveFixedPrice: false }
}

function applyDecision(hop: Hop, quote: string, decision: ReturnType<typeof evaluateQuote>, method: PayMode) {
  hop.quote = quote
  hop.counter = decision.counter === null ? null : formatUsdc(decision.counter)
  hop.counterReason = decision.reason
  hop.paymentMethod = method
  if (decision.kind === "walk_away") {
    hop.state = "walked_away"
    hop.price = null
    return
  }
  hop.price = formatUsdc(decision.price)
  hop.state = "held"
}

function pushReceipt(run: Run, hopId: "A" | "B", hop: Hop, outcome: ReturnType<typeof receiptOutcome>): Receipt {
  const parent = hopId === "B" ? run.receipts[0] ?? null : null
  const receipt = sealReceipt({
    id: crypto.randomUUID(),
    runId: run.id,
    hop: hopId,
    seller: hop.seller,
    handle: hop.handle,
    brief: hop.brief,
    quote: hop.quote ?? "0.00",
    counter: hop.counter,
    counterReason: hop.counterReason,
    price: hop.price,
    paymentMethod: hop.paymentMethod ?? run.payMode,
    outcome: outcome.outcome,
    successfulPaidHire: outcome.successfulPaidHire,
    marketUrl: hop.marketUrl,
    jobUrl: hop.jobUrl,
    mode: run.mode,
    parentReceiptId: parent?.id ?? null,
    parentHash: parent?.hash ?? null,
  })
  hop.receiptId = receipt.id
  hop.successfulPaidHire = outcome.successfulPaidHire
  run.receipts.push(receipt)
  return receipt
}

function syncMoney(run: Run, budget: bigint, ledger: Ledger) {
  run.accepted = formatUsdc(ledger.accepted)
  run.held = formatUsdc(ledger.held)
  run.remaining = formatUsdc(remainingOf(budget, ledger.accepted, ledger.held))
}

export async function runRelay(input: {
  id?: string
  task: string
  budget: string
  scenario: Scenario
  specialistHandle: string
  finisherHandle: string
  port: RelayPort
  now?: string
}): Promise<Run> {
  const budget = parseUsdc(input.budget)
  const split = assertSplit(budget)
  const now = input.now ?? new Date().toISOString()
  const run: Run = {
    id: input.id ?? crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    mode: "demo",
    scenario: input.scenario,
    task: input.task,
    budget: formatUsdc(budget),
    hopBFloor: formatUsdc(split.floor),
    hopAMax: formatUsdc(split.hopAMax),
    accepted: "0.00",
    held: "0.00",
    remaining: formatUsdc(budget),
    status: "running",
    confirmHop: null,
    payMode: "demo",
    hops: {
      A: blankHop("specialist", input.specialistHandle, formatUsdc(split.hopAMax)),
      B: blankHop("finisher", input.finisherHandle, formatUsdc(split.floor)),
    },
    receipts: [],
    rejectedInstructions: findRejectedInstructions(input.task),
    error: null,
    acceptReady: false,
  }
  let ledger = emptyLedger()
  const hopA = run.hops.A
  const hopB = run.hops.B
  hopA.marketUrl = null
  hopB.marketUrl = null
  hopA.brief = `Relay hop A for run ${run.id}`
  hopA.seller = "Demo specialist"

  const specialistQuote = await input.port.quote(input.specialistHandle)
  hopA.seller = specialistQuote.seller
  const decisionA = evaluateQuote({
    quote: specialistQuote.price,
    plannedMax: split.hopAMax,
    remaining: remainingOf(budget, ledger.accepted, ledger.held),
    liveFixedPrice: specialistQuote.liveFixedPrice,
    sellerAcceptsCounter: specialistQuote.acceptsCounter,
  })
  applyDecision(hopA, formatUsdc(specialistQuote.price), decisionA, "demo")
  if (decisionA.kind === "walk_away") {
    pushReceipt(run, "A", hopA, receiptOutcome({ walkedAway: true, qualityPass: null, settled: false }))
    hopB.state = "planned"
    run.status = "walked_away"
    syncMoney(run, budget, ledger)
    return run
  }

  const hiredA = await input.port.hire(input.specialistHandle, decisionA.price)
  hopA.jobUrl = hiredA.url
  ledger = hold(ledger, decisionA.charge)
  syncMoney(run, budget, ledger)

  if (input.scenario === "self_complete") {
    let submitted = false
    try {
      const markdown = specialistDeliverable({
        runId: run.id,
        finisherHandle: input.finisherHandle,
        finisherMarkdown: null,
      })
      await input.port.submit("specialist", markdown)
      submitted = true
    } catch {
      submitted = false
    }
    if (submitted) {
      throw new Error("Self-complete submitted a deliverable")
    }
    ledger = release(ledger, decisionA.charge)
    hopA.state = "failed"
    hopA.price = null
    hopA.quality = "fail"
    hopA.qualityReasons = ["specialist tried to submit the user deliverable without a finisher hire"]
    hopB.state = "planned"
    pushReceipt(run, "A", hopA, receiptOutcome({ walkedAway: false, qualityPass: false, settled: false }))
    run.status = "failed"
    run.error = hopA.qualityReasons[0]
    syncMoney(run, budget, ledger)
    return run
  }

  hopB.brief = `Relay hop B for run ${run.id}`
  const finisherQuote = await input.port.quote(input.finisherHandle)
  hopB.seller = finisherQuote.seller
  const decisionB = evaluateQuote({
    quote: finisherQuote.price,
    plannedMax: split.floor,
    remaining: remainingOf(budget, ledger.accepted, ledger.held),
    liveFixedPrice: finisherQuote.liveFixedPrice,
    sellerAcceptsCounter: finisherQuote.acceptsCounter,
  })
  applyDecision(hopB, formatUsdc(finisherQuote.price), decisionB, "demo")
  if (decisionB.kind === "walk_away") {
    ledger = release(ledger, decisionA.charge)
    hopA.state = "failed"
    hopA.price = null
    pushReceipt(run, "A", hopA, receiptOutcome({ walkedAway: false, qualityPass: false, settled: false }))
    pushReceipt(run, "B", hopB, receiptOutcome({ walkedAway: true, qualityPass: null, settled: false }))
    run.status = "walked_away"
    syncMoney(run, budget, ledger)
    return run
  }

  const hiredB = await input.port.hire(input.finisherHandle, decisionB.price)
  hopB.jobUrl = hiredB.url
  ledger = hold(ledger, decisionB.charge)
  const finisherMarkdown = finisherDeliverable({ runId: run.id, task: input.task })
  await input.port.submit("finisher", finisherMarkdown)
  hopB.deliverable = finisherMarkdown
  hopB.state = "delivered"
  const specialistMarkdown = specialistDeliverable({
    runId: run.id,
    finisherHandle: input.finisherHandle,
    finisherMarkdown,
  })
  await input.port.submit("specialist", specialistMarkdown)
  hopA.deliverable = specialistMarkdown
  hopA.state = "delivered"

  const quality = checkQuality({
    runId: run.id,
    task: input.task,
    markdown: finisherMarkdown,
    finisherHireCount: 1,
  })
  hopB.quality = quality.pass ? "pass" : "fail"
  hopA.quality = hopB.quality
  hopB.qualityReasons = quality.reasons
  hopA.qualityReasons = quality.reasons
  if (quality.pass) {
    ledger = settle(ledger, decisionA.charge)
    ledger = settle(ledger, decisionB.charge)
    hopA.state = "passed"
    hopB.state = "passed"
    pushReceipt(run, "A", hopA, receiptOutcome({ walkedAway: false, qualityPass: true, settled: true }))
    pushReceipt(run, "B", hopB, receiptOutcome({ walkedAway: false, qualityPass: true, settled: true }))
    run.status = "completed"
  } else {
    ledger = release(ledger, decisionA.charge)
    ledger = release(ledger, decisionB.charge)
    hopA.state = "failed"
    hopB.state = "failed"
    hopA.price = null
    hopB.price = null
    pushReceipt(run, "A", hopA, receiptOutcome({ walkedAway: false, qualityPass: false, settled: false }))
    pushReceipt(run, "B", hopB, receiptOutcome({ walkedAway: false, qualityPass: false, settled: false }))
    run.status = "failed"
  }
  syncMoney(run, budget, ledger)
  run.updatedAt = now
  return run
}
