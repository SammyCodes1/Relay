import { createHash } from "crypto"

export type PayMode = "demo" | "mcp-prepare" | "mcp-pro" | "x402"
export type RunMode = "demo" | "live"
export type Scenario = "happy" | "counter" | "walkaway" | "self_complete" | "injection"
export type RunStatus = "awaiting_confirm" | "running" | "completed" | "walked_away" | "failed"
export type HopId = "A" | "B"
export type HopState =
  | "planned"
  | "quoted"
  | "awaiting_confirm"
  | "awaiting_approval"
  | "held"
  | "working"
  | "delivered"
  | "passed"
  | "failed"
  | "walked_away"

export type ReceiptOutcome = "pass" | "fail" | "walked_away" | "pending" | "quality_failed_settled"

export interface Receipt {
  id: string
  runId: string
  hop: HopId
  seller: string
  handle: string
  brief: string
  quote: string
  counter: string | null
  counterReason: string | null
  price: string | null
  paymentMethod: PayMode
  outcome: ReceiptOutcome
  successfulPaidHire: boolean
  marketUrl: string | null
  jobUrl: string | null
  mode: RunMode
  parentReceiptId: string | null
  parentHash: string | null
  hash: string
}

export interface Hop {
  role: "specialist" | "finisher"
  handle: string
  seller: string
  brief: string
  plannedMax: string
  quote: string | null
  counter: string | null
  counterReason: string | null
  price: string | null
  state: HopState
  paymentMethod: PayMode | null
  marketUrl: string | null
  jobUrl: string | null
  approvalUrl: string | null
  assignmentId: string | null
  error: string | null
  deliverable: string | null
  quality: "pass" | "fail" | null
  qualityReasons: string[]
  successfulPaidHire: boolean
  receiptId: string | null
}

export interface RunPrivate {
  hopARequestId?: string
  hopBRequestId?: string
  hopATaskId?: string
  hopBTaskId?: string
  hopAJobId?: string
  hopBJobId?: string
  specialistAgentId?: string
  finisherAgentId?: string
  hopAConfirmedAtomic?: string
  hopBConfirmedAtomic?: string
  hopAAssignmentStarted?: boolean
  hopBAssignmentStarted?: boolean
  hopASettled?: boolean
  hopBSettled?: boolean
  acceptLinked?: boolean
  walkNoted?: boolean
  walletHop?: "A" | "B"
  walletMessageId?: string
  walletText?: string
  walletRow?: Record<string, unknown>
}

export interface Run {
  id: string
  createdAt: string
  updatedAt: string
  mode: RunMode
  scenario: Scenario | null
  task: string
  budget: string
  hopBFloor: string
  hopAMax: string
  accepted: string
  held: string
  remaining: string
  status: RunStatus
  confirmHop: HopId | null
  payMode: PayMode
  hops: { A: Hop; B: Hop }
  receipts: Receipt[]
  rejectedInstructions: string[]
  error: string | null
  acceptReady: boolean
  private?: RunPrivate
}

export function publicRun(run: Run): Omit<Run, "private"> {
  const copy: Run = { ...run, hops: { A: { ...run.hops.A }, B: { ...run.hops.B } }, receipts: run.receipts.map((r) => ({ ...r })) }
  delete copy.private
  return copy
}

export function sealReceipt(partial: Omit<Receipt, "hash">): Receipt {
  const draft: Receipt = { ...partial, hash: "" }
  const body = { ...draft, hash: "" }
  const hash = createHash("sha256").update(JSON.stringify(body)).digest("hex")
  return { ...draft, hash }
}

export function blankHop(role: Hop["role"], handle: string, plannedMax: string): Hop {
  return {
    role,
    handle,
    seller: handle,
    brief: "",
    plannedMax,
    quote: null,
    counter: null,
    counterReason: null,
    price: null,
    state: "planned",
    paymentMethod: null,
    marketUrl: null,
    jobUrl: null,
    approvalUrl: null,
    assignmentId: null,
    error: null,
    deliverable: null,
    quality: null,
    qualityReasons: [],
    successfulPaidHire: false,
    receiptId: null,
  }
}
