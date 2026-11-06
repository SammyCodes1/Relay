import { embedEnvelope, parseEnvelope } from "../lib/envelope"
import { assertSplit, evaluateQuote, hold, release, remainingOf, settle, type Ledger } from "../lib/budget"
import { finisherDeliverable, specialistDeliverable } from "../lib/deliverables"
import { findRejectedInstructions } from "../lib/injection"
import { formatUsdc, parseUsdc, parseUsdcLoose } from "../lib/money"
import { checkQuality, receiptOutcome, type ReceiptOutcome } from "../lib/quality"
import { redact } from "../lib/redact"
import { blankHop, publicRun, sealReceipt, type Hop, type HopId, type Run } from "../lib/types"
import { missingLive, readConfig, type AppConfig } from "./config"
import { agentHost, defaultPlanAmount, findAgent, readAgentCard } from "./market/catalog"
import { artifactText, assertWithinConfirmed, buildXPaymentHeader, classifyState, getTask, payA2A, pickNearRow, quoteA2A, type AcceptRow } from "./market/a2a"
import { MarketMcp } from "./market/mcp"
import { WorkerApi } from "./market/worker"
import { xPaymentForRow } from "./market/x402"
import { listRuns, loadRun, saveRun } from "./store"

function ledgerOf(run: Run): Ledger {
  return { accepted: parseUsdcLoose(run.accepted), held: parseUsdcLoose(run.held) }
}

function writeLedger(run: Run, ledger: Ledger) {
  const budget = parseUsdc(run.budget)
  run.accepted = formatUsdc(ledger.accepted)
  run.held = formatUsdc(ledger.held)
  run.remaining = formatUsdc(remainingOf(budget, ledger.accepted, ledger.held))
}

function remember(run: Run, hop: HopId, hopRow: Hop, marked: { outcome: ReceiptOutcome; successfulPaidHire: boolean }) {
  const parent = hop === "B" ? run.receipts.find((item) => item.hop === "A") ?? null : null
  const receipt = sealReceipt({
    id: crypto.randomUUID(),
    runId: run.id,
    hop,
    seller: hopRow.seller,
    handle: hopRow.handle,
    brief: hopRow.brief,
    quote: hopRow.quote ?? "0.00",
    counter: hopRow.counter,
    counterReason: hopRow.counterReason,
    price: hopRow.price,
    paymentMethod: hopRow.paymentMethod ?? run.payMode,
    outcome: marked.outcome,
    successfulPaidHire: marked.successfulPaidHire,
    marketUrl: hopRow.marketUrl,
    jobUrl: hopRow.jobUrl,
    mode: "live",
    parentReceiptId: parent?.id ?? null,
    parentHash: parent?.hash ?? null,
  })
  hopRow.receiptId = receipt.id
  hopRow.successfulPaidHire = marked.successfulPaidHire
  run.receipts = run.receipts.filter((item) => item.hop !== hop)
  run.receipts.push(receipt)
  if (hop === "B") run.receipts.sort((a, b) => a.hop.localeCompare(b.hop))
}

function briefFor(run: Run, hop: HopId, config: AppConfig): string {
  const title = hop === "A" ? "Relay hop A" : "Relay hop B"
  return embedEnvelope(title, {
    v: 1,
    runId: run.id,
    task: run.task,
    finisherHandle: config.finisherHandle,
    hopBBudget: run.hopBFloor,
  })
}

function balancesOf(who: unknown): { credit: bigint; usdc: bigint | null } {
  const root = who as { balances?: { credit_usd?: string | null; usdc?: string | null }; account?: { balances?: { credit_usd?: string | null; usdc?: string | null } } }
  const balances = root.balances ?? root.account?.balances
  if (!balances) throw new Error("whoami returned no balances. Nothing was charged.")
  return {
    credit: parseUsdcLoose(balances.credit_usd),
    usdc: balances.usdc == null ? null : parseUsdcLoose(balances.usdc),
  }
}

function assertCovers(who: unknown, price: bigint) {
  const balances = balancesOf(who)
  const have = balances.credit + (balances.usdc ?? 0n)
  if (balances.usdc === null && balances.credit < price) {
    throw new Error("USDC balance could not be read and credit does not cover the quote. Nothing was charged.")
  }
  if (have < price) {
    throw new Error(`Buyer USDC balance ${formatUsdc(have)} does not cover ${formatUsdc(price)}. Nothing was charged.`)
  }
}

async function quoted(config: AppConfig, handle: string) {
  const agent = await findAgent(config.marketBase, handle)
  await readAgentCard(config.marketBase, handle)
  const amount = await defaultPlanAmount(config.marketBase, agent.agentId)
  return { agent, amount: parseUsdc(amount), amountText: amount }
}

export async function createLiveRun(task: string, budgetText: string): Promise<Run> {
  const config = readConfig()
  const missing = missingLive(config)
  if (missing.length > 0) {
    throw new Error(`Live mode is missing ${missing.join(", ")}`)
  }
  const budget = parseUsdc(budgetText)
  const split = assertSplit(budget)
  const now = new Date().toISOString()
  const run: Run = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    mode: "live",
    scenario: null,
    task,
    budget: formatUsdc(budget),
    hopBFloor: formatUsdc(split.floor),
    hopAMax: formatUsdc(split.hopAMax),
    accepted: "0.00",
    held: "0.00",
    remaining: formatUsdc(budget),
    status: "running",
    confirmHop: null,
    payMode: config.payMode,
    hops: {
      A: blankHop("specialist", config.specialistHandle, formatUsdc(split.hopAMax)),
      B: blankHop("finisher", config.finisherHandle, formatUsdc(split.floor)),
    },
    receipts: [],
    rejectedInstructions: findRejectedInstructions(task),
    error: null,
    acceptReady: false,
    private: {},
  }
  const hop = run.hops.A
  hop.marketUrl = `${agentHost(config.marketBase, config.specialistHandle)}`
  hop.brief = briefFor(run, "A", config)
  try {
    const offer = await quoted(config, config.specialistHandle)
    hop.seller = offer.agent.name
    run.private!.specialistAgentId = offer.agent.agentId
    const decision = evaluateQuote({
      quote: offer.amount,
      plannedMax: split.hopAMax,
      remaining: budget,
      liveFixedPrice: true,
      sellerAcceptsCounter: false,
    })
    hop.quote = formatUsdc(offer.amount)
    hop.counter = decision.counter === null ? null : formatUsdc(decision.counter)
    hop.counterReason = decision.reason
    hop.paymentMethod = config.payMode
    if (decision.kind === "walk_away") {
      hop.state = "walked_away"
      run.status = "walked_away"
      remember(run, "A", hop, receiptOutcome({ walkedAway: true, qualityPass: null, settled: false }))
    } else {
      hop.state = "awaiting_confirm"
      hop.price = formatUsdc(decision.price)
      run.status = "awaiting_confirm"
      run.confirmHop = "A"
      run.private!.hopAConfirmedAtomic = decision.price.toString()
    }
  } catch (error) {
    hop.state = "failed"
    hop.error = redact(error instanceof Error ? error.message : String(error), [config.x402Key])
    run.status = "failed"
    run.error = hop.error
  }
  await saveRun(run)
  return run
}

async function payX402(config: AppConfig, handle: string, text: string, confirmed: bigint) {
  const messageId = crypto.randomUUID()
  const rows = await quoteA2A({ marketBase: config.marketBase, handle, text, messageId })
  const row = pickNearRow(rows, config.x402Network)
  const amount = assertWithinConfirmed(row, confirmed)
  const header = await xPaymentForRow(row, config.x402Account, config.x402Key)
  const task = await payA2A({ marketBase: config.marketBase, handle, text, messageId, paymentHeader: header })
  return { task, amount }
}

function proConfig(config: AppConfig): AppConfig {
  return { ...config, payMode: "mcp-pro", mcpUrl: "https://market.near.ai/mcp/pro" }
}

async function payMcp(config: AppConfig, agentId: string, title: string, description: string, confirmed: bigint) {
  const mcp = await MarketMcp.connect(proConfig(config))
  const who = await mcp.tool("marketplace__whoami", {})
  assertCovers(who, confirmed)
  const requestId = crypto.randomUUID()
  const result = await mcp.tool("marketplace__create_job", {
    worker_agent_id: agentId,
    title,
    description,
    client_request_id: requestId,
    token: "USDC",
    acceptance_window_days: 7,
  }) as Record<string, unknown>
  return { kind: "hired" as const, requestId, result }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {}
}

export async function prepareWalletChallenge(id: string, hop: HopId) {
  const config = readConfig()
  const run = await loadRun(id)
  if (!run) throw new Error("Unknown run")
  if (run.mode !== "live") throw new Error("Demo runs do not take a wallet payment")
  if (run.confirmHop !== hop || run.status !== "awaiting_confirm") {
    throw new Error("This hop is not waiting for confirmation")
  }
  const handle = hop === "A" ? config.specialistHandle : config.finisherHandle
  const confirmed = BigInt(hop === "A" ? run.private?.hopAConfirmedAtomic ?? "0" : run.private?.hopBConfirmedAtomic ?? "0")
  const text = run.hops[hop].brief || briefFor(run, hop, config)
  const messageId = crypto.randomUUID()
  const rows = await quoteA2A({ marketBase: config.marketBase, handle, text, messageId })
  const row = pickNearRow(rows, config.x402Network)
  assertWithinConfirmed(row, confirmed)
  run.private ??= {}
  run.private.walletHop = hop
  run.private.walletMessageId = messageId
  run.private.walletText = text
  run.private.walletRow = row
  await saveRun(run)
  return { handle, messageId, row, amount: row.amount }
}

export async function confirmRun(id: string, hop: HopId | "accept", signedDelegateAction?: string): Promise<Run> {
  const config = readConfig()
  const run = await loadRun(id)
  if (!run) throw new Error("Unknown run")
  if (run.mode !== "live") throw new Error("Demo runs do not take a payment confirm")
  try {
    if (hop === "accept") {
      await confirmAccept(config, run)
    } else {
      if (run.confirmHop !== hop || run.status !== "awaiting_confirm") {
        throw new Error("This hop is not waiting for confirmation")
      }
      if (hop === "A") await confirmHire(config, run, "A", signedDelegateAction)
      else await confirmHire(config, run, "B", signedDelegateAction)
    }
  } catch (error) {
    const message = redact(error instanceof Error ? error.message : String(error), [config.x402Key])
    run.error = message
    run.hops[hop === "accept" ? "A" : hop].error = message
    await saveRun(run)
    throw new Error(message)
  }
  await saveRun(run)
  return run
}

async function confirmHire(config: AppConfig, run: Run, hop: HopId, signedDelegateAction?: string) {
  const handle = hop === "A" ? config.specialistHandle : config.finisherHandle
  const row = run.hops[hop]
  const offer = await quoted(config, handle)
  const confirmed = BigInt(hop === "A" ? run.private?.hopAConfirmedAtomic ?? "0" : run.private?.hopBConfirmedAtomic ?? "0")
  if (offer.amount > confirmed) {
    throw new Error(`Price moved to ${formatUsdc(offer.amount)} USDC, above the confirmed ${formatUsdc(confirmed)} USDC. Nothing was signed.`)
  }
  row.seller = offer.agent.name
  const text = row.brief || briefFor(run, hop, config)
  row.brief = text
  if (signedDelegateAction) {
    const stored = run.private?.walletRow
    if (run.private?.walletHop !== hop || !stored || !run.private.walletMessageId || !run.private.walletText) {
      throw new Error("Ask the wallet to sign a fresh quote before paying")
    }
    const header = buildXPaymentHeader(stored as AcceptRow, signedDelegateAction)
    const task = await payA2A({
      marketBase: config.marketBase,
      handle,
      text: run.private.walletText,
      messageId: run.private.walletMessageId,
      paymentHeader: header,
    })
    const amount = BigInt(String(stored.amount ?? "0"))
    const kind = classifyState(task.status.state)
    if (kind === "free") {
      row.state = "failed"
      row.error = `Task ${task.status.state} charged nothing`
      run.status = "failed"
      return
    }
    run.payMode = "x402"
    row.paymentMethod = "x402"
    row.price = formatUsdc(amount)
    row.state = kind === "done" ? "delivered" : "working"
    if (hop === "A") {
      run.private.hopATaskId = task.id
      run.private.specialistAgentId = offer.agent.agentId
      if (kind === "done") run.private.hopASettled = true
    } else {
      run.private.hopBTaskId = task.id
      run.private.finisherAgentId = offer.agent.agentId
      if (kind === "done") run.private.hopBSettled = true
    }
    let ledger = hold(ledgerOf(run), amount)
    if (kind === "done") ledger = settle(ledger, amount)
    writeLedger(run, ledger)
    run.confirmHop = null
    run.status = "running"
    run.error = null
    return
  }
  if (config.payMode === "x402" || run.payMode === "x402") {
    const paid = await payX402(config, handle, text, confirmed)
    const kind = classifyState(paid.task.status.state)
    if (kind === "free") {
      row.state = "failed"
      row.error = `Task ${paid.task.status.state} charged nothing`
      run.status = "failed"
      return
    }
    row.price = formatUsdc(paid.amount)
    row.state = kind === "done" ? "delivered" : "working"
    if (hop === "A") {
      run.private!.hopATaskId = paid.task.id
      run.private!.specialistAgentId = offer.agent.agentId
      if (kind === "done") run.private!.hopASettled = true
    } else {
      run.private!.hopBTaskId = paid.task.id
      run.private!.finisherAgentId = offer.agent.agentId
      if (kind === "done") run.private!.hopBSettled = true
    }
    let ledger = hold(ledgerOf(run), paid.amount)
    if (kind === "done") ledger = settle(ledger, paid.amount)
    writeLedger(run, ledger)
  } else {
    if (hop === "A") run.private!.specialistAgentId = offer.agent.agentId
    else run.private!.finisherAgentId = offer.agent.agentId
    const paid = await payMcp(config, offer.agent.agentId, hop === "A" ? "Relay specialist" : "Relay finisher", text, confirmed)
    const requestKey = hop === "A" ? "hopARequestId" : "hopBRequestId"
    run.private![requestKey] = paid.requestId
    const jobId = typeof paid.result.job_id === "string" ? paid.result.job_id : undefined
    const assignmentId = typeof paid.result.assignment_id === "string" ? paid.result.assignment_id : undefined
    if (!jobId) {
      throw new Error("Marketplace did not fund the hire. Nothing on the approval page is required. Check the buyer balance.")
    }
    run.payMode = "mcp-pro"
    row.paymentMethod = "mcp-pro"
    row.jobUrl = typeof paid.result.job_url === "string" ? paid.result.job_url : null
    row.assignmentId = assignmentId ?? null
    if (hop === "A") run.private!.hopAJobId = jobId
    else run.private!.hopBJobId = jobId
    row.state = "held"
    row.price = formatUsdc(confirmed)
    writeLedger(run, hold(ledgerOf(run), confirmed))
  }
  run.confirmHop = null
  run.status = "running"
  run.error = null
}

async function confirmAccept(config: AppConfig, run: Run) {
  if (!run.acceptReady || (run.payMode !== "mcp-pro" && config.payMode !== "mcp-pro")) {
    throw new Error("Acceptance is not waiting for confirmation")
  }
  const mcp = await MarketMcp.connect(proConfig(config))
  const jobs = [
    { hop: "A" as const, id: run.private?.hopAJobId, assignment: run.hops.A.assignmentId },
    { hop: "B" as const, id: run.private?.hopBJobId, assignment: run.hops.B.assignmentId },
  ]
  for (const job of jobs) {
    if (!job.id) continue
    await mcp.tool("marketplace__accept_result", { job_id: job.id, assignment_id: job.assignment ?? undefined })
    const row = run.hops[job.hop]
    const price = parseUsdc(row.price ?? "0")
    if (price > 0n && ledgerOf(run).held >= price) writeLedger(run, settle(ledgerOf(run), price))
    row.state = "passed"
    row.quality = "pass"
    remember(run, job.hop, row, receiptOutcome({ walkedAway: false, qualityPass: true, settled: true }))
  }
  run.acceptReady = false
  run.status = "completed"
}

let lastTick = 0

export async function tickLive(force = false): Promise<void> {
  if (!force && Date.now() - lastTick < 10_000) return
  lastTick = Date.now()
  const config = readConfig()
  if (missingLive(config).length > 0) return
  const runs = await listRuns()
  for (const listed of runs) {
    if (listed.mode !== "live") continue
    if (listed.status === "completed" || listed.status === "walked_away") continue
    const run = await loadRun(listed.id)
    if (!run) continue
    const seenAt = run.updatedAt
    try {
      await advance(config, run)
    } catch (error) {
      run.error = redact(error instanceof Error ? error.message : String(error), [config.x402Key])
    }
    await saveRun(run, seenAt).catch(() => undefined)
  }
}

async function advance(config: AppConfig, run: Run) {
  await replayDrafts(config, run)
  await pollX402(config, run)
  if (config.specialistToken) await workSpecialist(config, run)
  if (config.finisherToken) await workFinisher(config, run)
  await finishQuality(config, run)
}

async function replayDrafts(config: AppConfig, run: Run) {
  if (config.payMode !== "mcp-prepare") return
  const mcp = run.hops.A.state === "awaiting_approval" || run.hops.B.state === "awaiting_approval"
    ? await MarketMcp.connect(config)
    : null
  if (!mcp) return
  for (const hop of ["A", "B"] as const) {
    const row = run.hops[hop]
    if (row.state !== "awaiting_approval") continue
    const requestId = hop === "A" ? run.private?.hopARequestId : run.private?.hopBRequestId
    const agentId = hop === "A" ? run.private?.specialistAgentId : run.private?.finisherAgentId
    if (!requestId || !agentId) continue
    const result = asRecord(await mcp.tool("marketplace__prepare_job", {
      worker_agent_id: agentId,
      title: hop === "A" ? "Relay specialist" : "Relay finisher",
      description: row.brief,
      client_request_id: requestId,
      token: "USDC",
      acceptance_window_days: 7,
    }))
    if (typeof result.job_id === "string") {
      row.jobUrl = typeof result.job_url === "string" ? result.job_url : row.jobUrl
      row.assignmentId = typeof result.assignment_id === "string" ? result.assignment_id : row.assignmentId
      if (hop === "A") run.private!.hopAJobId = result.job_id
      else run.private!.hopBJobId = result.job_id
      row.state = "held"
      const price = parseUsdc(row.price ?? "0")
      writeLedger(run, hold(ledgerOf(run), price))
    }
  }
}

async function pollX402(config: AppConfig, run: Run) {
  if (run.payMode !== "x402" && config.payMode !== "x402") return
  for (const hop of ["A", "B"] as const) {
    const taskId = hop === "A" ? run.private?.hopATaskId : run.private?.hopBTaskId
    const settled = hop === "A" ? run.private?.hopASettled : run.private?.hopBSettled
    const row = run.hops[hop]
    if (!taskId || settled) continue
    const task = await getTask({ marketBase: config.marketBase, handle: row.handle, taskId })
    const kind = classifyState(task.status.state)
    if (kind === "working") {
      if (row.state !== "passed" && row.state !== "failed") row.state = "working"
      continue
    }
    const price = parseUsdc(row.price ?? "0")
    if (kind === "free") {
      if (ledgerOf(run).held >= price && price > 0n) writeLedger(run, release(ledgerOf(run), price))
      row.state = "failed"
      row.price = null
      row.error = `Task ${task.status.state} charged nothing`
    } else {
      const text = artifactText(task)
      if (text && !row.deliverable) row.deliverable = text
      if (ledgerOf(run).held >= price && price > 0n) writeLedger(run, settle(ledgerOf(run), price))
      if (row.state === "working" || row.state === "held") row.state = "delivered"
    }
    if (hop === "A") run.private!.hopASettled = true
    else run.private!.hopBSettled = true
  }
}

async function workFinisher(config: AppConfig, run: Run) {
  const api = new WorkerApi(config.marketBase, config.finisherToken)
  const rows = await api.listAssignments()
  for (const assignment of rows) {
    const envelope = parseEnvelope(assignment.description)
    if (!envelope || envelope.runId !== run.id) continue
    if (!assignment.startedAt && !run.private?.hopBAssignmentStarted) {
      await api.start(assignment.assignmentId)
      await api.message(assignment.assignmentId, `Picked up run ${run.id}. The brief is data.`)
      run.private!.hopBAssignmentStarted = true
    }
    if (assignment.submittedAt || run.hops.B.deliverable) continue
    const markdown = finisherDeliverable({ runId: run.id, task: envelope.task })
    await api.submit(assignment.assignmentId, markdown)
    run.hops.B.deliverable = markdown
    run.hops.B.assignmentId = assignment.assignmentId
    run.hops.B.state = "delivered"
  }
}

async function workSpecialist(config: AppConfig, run: Run) {
  const api = new WorkerApi(config.marketBase, config.specialistToken)
  const rows = await api.listAssignments()
  for (const assignment of rows) {
    const envelope = parseEnvelope(assignment.description)
    if (!envelope || envelope.runId !== run.id) continue
    if (envelope.finisherHandle !== config.finisherHandle) {
      if (!run.rejectedInstructions.includes("brief tried to change the finisher handle")) {
        run.rejectedInstructions.push("brief tried to change the finisher handle")
      }
    }
    if (!assignment.startedAt && !run.private?.hopAAssignmentStarted) {
      await api.start(assignment.assignmentId)
      await api.message(assignment.assignmentId, `Picked up run ${run.id}. Next hop stays inside the reserved floor.`)
      run.private!.hopAAssignmentStarted = true
      run.hops.A.assignmentId = assignment.assignmentId
    }
    if (run.hops.B.state === "planned" && run.status !== "awaiting_confirm") {
      const offer = await quoted(config, config.finisherHandle)
      run.private!.finisherAgentId = offer.agent.agentId
      const decision = evaluateQuote({
        quote: offer.amount,
        plannedMax: parseUsdc(run.hopBFloor),
        remaining: parseUsdcLoose(run.remaining),
        liveFixedPrice: true,
        sellerAcceptsCounter: false,
      })
      const hop = run.hops.B
      hop.seller = offer.agent.name
      hop.handle = config.finisherHandle
      hop.marketUrl = agentHost(config.marketBase, config.finisherHandle)
      hop.brief = briefFor(run, "B", config)
      hop.quote = formatUsdc(offer.amount)
      hop.counter = decision.counter === null ? null : formatUsdc(decision.counter)
      hop.counterReason = decision.reason
      hop.paymentMethod = config.payMode
      if (decision.kind === "walk_away") {
        hop.state = "walked_away"
        run.status = "walked_away"
        hop.successfulPaidHire = false
        run.hops.A.successfulPaidHire = false
        run.error = "Hop B is above the reserved floor. Nothing was signed for hop B. Hop A is not a successful hire."
        remember(run, "B", hop, receiptOutcome({ walkedAway: true, qualityPass: null, settled: false }))
      } else {
        hop.price = formatUsdc(decision.price)
        hop.state = "awaiting_confirm"
        run.status = "awaiting_confirm"
        run.confirmHop = "B"
        run.private!.hopBConfirmedAtomic = decision.price.toString()
      }
    }
    if (!assignment.submittedAt && run.hops.B.deliverable && !run.hops.A.deliverable) {
      const markdown = specialistDeliverable({
        runId: run.id,
        finisherHandle: config.finisherHandle,
        finisherMarkdown: run.hops.B.deliverable,
      })
      await api.submit(assignment.assignmentId, markdown)
      run.hops.A.deliverable = markdown
      if (run.hops.A.state === "working" || run.hops.A.state === "held") run.hops.A.state = "delivered"
    }
  }
}

async function finishQuality(config: AppConfig, run: Run) {
  if (!run.hops.B.deliverable || !run.hops.A.deliverable) return
  if (run.status === "completed" || run.status === "failed") return
  if (!run.hops.A.quality) {
    const quality = checkQuality({
      runId: run.id,
      task: run.task,
      markdown: run.hops.B.deliverable,
      finisherHireCount: 1,
    })
    run.hops.A.quality = quality.pass ? "pass" : "fail"
    run.hops.B.quality = run.hops.A.quality
    run.hops.A.qualityReasons = quality.reasons
    run.hops.B.qualityReasons = quality.reasons
    if (!quality.pass && run.payMode !== "x402" && config.payMode !== "x402") {
      const mcp = await MarketMcp.connect(run.payMode === "mcp-pro" ? proConfig(config) : config)
      const feedback = `Quality check failed. ${quality.reasons.join(" ")}`.slice(0, 4000)
      for (const hop of ["A", "B"] as const) {
        const jobId = hop === "A" ? run.private?.hopAJobId : run.private?.hopBJobId
        if (!jobId) continue
        await mcp.tool("marketplace__request_changes", {
          job_id: jobId,
          assignment_id: run.hops[hop].assignmentId ?? undefined,
          feedback,
        })
      }
      run.hops.A.state = "failed"
      run.hops.B.state = "failed"
      run.hops.A.successfulPaidHire = false
      run.hops.B.successfulPaidHire = false
      remember(run, "A", run.hops.A, receiptOutcome({ walkedAway: false, qualityPass: false, settled: false }))
      remember(run, "B", run.hops.B, receiptOutcome({ walkedAway: false, qualityPass: false, settled: false }))
      run.status = "failed"
      return
    }
    if (!quality.pass && (run.payMode === "x402" || config.payMode === "x402") && run.private?.hopASettled && run.private?.hopBSettled) {
      run.hops.A.state = "failed"
      run.hops.B.state = "failed"
      remember(run, "A", run.hops.A, receiptOutcome({ walkedAway: false, qualityPass: false, settled: true }))
      remember(run, "B", run.hops.B, receiptOutcome({ walkedAway: false, qualityPass: false, settled: true }))
      run.status = "failed"
      return
    }
    if (quality.pass && (run.payMode === "mcp-pro" || config.payMode === "mcp-pro")) {
      run.acceptReady = true
      return
    }
  }
  if ((run.payMode === "mcp-pro" || config.payMode === "mcp-pro") && run.hops.A.quality === "pass" && run.hops.B.quality === "pass") {
    run.acceptReady = true
    if (run.error === "fetch failed") run.error = null
    return
  }
  if ((run.payMode === "x402" || config.payMode === "x402") && run.hops.A.quality === "pass" && run.private?.hopASettled && run.private?.hopBSettled) {
    run.hops.A.state = "passed"
    run.hops.B.state = "passed"
    remember(run, "A", run.hops.A, receiptOutcome({ walkedAway: false, qualityPass: true, settled: true }))
    remember(run, "B", run.hops.B, receiptOutcome({ walkedAway: false, qualityPass: true, settled: true }))
    run.status = "completed"
    return
  }
  if (run.payMode === "x402" || run.payMode === "mcp-pro" || config.payMode === "x402" || config.payMode !== "mcp-prepare" || run.hops.A.quality !== "pass") return
  const mcp = await MarketMcp.connect(config)
  if (!run.private?.acceptLinked) {
    for (const hop of ["A", "B"] as const) {
      const jobId = hop === "A" ? run.private?.hopAJobId : run.private?.hopBJobId
      if (!jobId) continue
      const accepted = asRecord(await mcp.tool("marketplace__accept_result", {
        job_id: jobId,
        assignment_id: run.hops[hop].assignmentId ?? undefined,
      }))
      if (typeof accepted.job_url === "string") run.hops[hop].jobUrl = accepted.job_url
    }
    run.private!.acceptLinked = true
  }
  const jobId = run.private?.hopAJobId
  if (!jobId) return
  const status = asRecord(await mcp.tool("marketplace__get_job_status", { job_id: jobId }))
  if (status.status === "completed" || status.worker_state === "finished") {
    const priceA = parseUsdc(run.hops.A.price ?? "0")
    const priceB = parseUsdc(run.hops.B.price ?? "0")
    let ledger = ledgerOf(run)
    if (priceA > 0n && ledger.held >= priceA) ledger = settle(ledger, priceA)
    if (priceB > 0n && ledger.held >= priceB) ledger = settle(ledger, priceB)
    writeLedger(run, ledger)
    run.hops.A.state = "passed"
    run.hops.B.state = "passed"
    remember(run, "A", run.hops.A, receiptOutcome({ walkedAway: false, qualityPass: true, settled: true }))
    remember(run, "B", run.hops.B, receiptOutcome({ walkedAway: false, qualityPass: true, settled: true }))
    run.status = "completed"
  }
}

export async function publicById(id: string) {
  const run = await loadRun(id)
  if (!run) return null
  return publicRun(run)
}
