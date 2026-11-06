import { assertOk, marketFetch } from "./http"
import { agentHost } from "./catalog"

export interface AcceptRow {
  scheme: string
  network: string
  asset: string
  amount: string
  payTo: string
  maxTimeoutSeconds: number
  [key: string]: unknown
}

export interface TaskView {
  id: string
  status: { state: string }
  artifacts?: Array<{ parts?: Array<{ text?: string }> }>
}

export function parse402(body: unknown): AcceptRow[] {
  if (!body || typeof body !== "object" || !("accepts" in body)) {
    throw new Error("402 body has no accepts array")
  }
  const accepts = (body as { accepts: unknown }).accepts
  if (!Array.isArray(accepts) || accepts.length === 0) {
    throw new Error("402 accepts is empty. This deployment takes no payment.")
  }
  return accepts.map((row) => {
    if (!row || typeof row !== "object") throw new Error("402 accept row is not an object")
    const item = row as AcceptRow
    if (item.scheme !== "exact") throw new Error("402 scheme is not exact")
    if (typeof item.network !== "string" || typeof item.asset !== "string" || typeof item.payTo !== "string") {
      throw new Error("402 accept row is missing network, asset, or payTo")
    }
    if (typeof item.amount !== "string" || !/^\d+$/.test(item.amount)) throw new Error("402 amount is not an atomic string")
    if (typeof item.maxTimeoutSeconds !== "number") throw new Error("402 maxTimeoutSeconds is missing")
    return item
  })
}

export function assertWithinConfirmed(row: AcceptRow, confirmed: bigint): bigint {
  const amount = BigInt(row.amount)
  if (amount > confirmed) {
    throw new Error(`402 amount ${row.amount} is above the confirmed max ${confirmed.toString()}. Not signed.`)
  }
  return amount
}

export function pickNearRow(rows: AcceptRow[], preferredNetwork: string): AcceptRow {
  const near = rows.filter((row) => row.network.startsWith("near:"))
  if (preferredNetwork) {
    const match = near.find((row) => row.network === preferredNetwork)
    if (!match) throw new Error(`402 has no row for ${preferredNetwork}`)
    return match
  }
  if (near.length !== 1) {
    throw new Error("402 has more than one NEAR row. Set X402_NETWORK to the row you will fund.")
  }
  return near[0]
}

export function buildXPaymentHeader(row: AcceptRow, signedDelegateAction: string): string {
  const header = { x402Version: 2, accepted: row, payload: { signedDelegateAction } }
  return Buffer.from(JSON.stringify(header)).toString("base64")
}

export function readTask(payload: unknown): TaskView {
  if (!payload || typeof payload !== "object") throw new Error("A2A response was empty")
  const body = payload as { error?: { code?: number; message?: string }; result?: { task?: TaskView; id?: string; status?: { state: string }; artifacts?: TaskView["artifacts"] } }
  if (body.error) throw new Error(`A2A ${body.error.code ?? ""} ${body.error.message ?? "error"}`.trim())
  const result = body.result
  if (!result) throw new Error("A2A response has no result")
  if (result.task?.id) return result.task
  if (result.id && result.status) return result as TaskView
  throw new Error("A2A response has no task")
}

export function classifyState(state: string): "done" | "working" | "free" {
  if (state === "TASK_STATE_COMPLETED") return "done"
  if (state === "TASK_STATE_REJECTED" || state === "TASK_STATE_FAILED" || state === "TASK_STATE_CANCELED") return "free"
  return "working"
}

export function artifactText(task: TaskView): string {
  const parts = task.artifacts?.flatMap((artifact) => artifact.parts ?? []) ?? []
  return parts.map((part) => part.text ?? "").filter(Boolean).join("\n")
}

export function messageBody(text: string, id: number, messageId: string) {
  return {
    jsonrpc: "2.0",
    id,
    method: "SendMessage",
    params: {
      message: { messageId, role: "ROLE_USER", parts: [{ text }] },
      configuration: { historyLength: 0, returnImmediately: true },
    },
  }
}

export async function postA2A(input: {
  marketBase: string
  handle: string
  body: unknown
  paymentHeader?: string
  fetchImpl?: typeof fetch
}) {
  const fetchImpl = input.fetchImpl ?? fetch
  const url = `${agentHost(input.marketBase, input.handle)}/a2a/v1`
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" }
  if (input.paymentHeader) headers["X-PAYMENT"] = input.paymentHeader
  const result = await marketFetch(url, { method: "POST", headers, body: JSON.stringify(input.body) }, fetchImpl)
  return { url, ...result }
}

export async function quoteA2A(input: { marketBase: string; handle: string; text: string; messageId: string; fetchImpl?: typeof fetch }) {
  const sent = await postA2A({ ...input, body: messageBody(input.text, 1, input.messageId) })
  if (sent.status !== 402) {
    throw new Error(`Expected HTTP 402 from ${input.handle}, got ${sent.status} ${sent.text.slice(0, 400)}`)
  }
  return parse402(sent.json)
}

export async function payA2A(input: {
  marketBase: string
  handle: string
  text: string
  messageId: string
  paymentHeader: string
  fetchImpl?: typeof fetch
}) {
  const sent = await postA2A({
    marketBase: input.marketBase,
    handle: input.handle,
    fetchImpl: input.fetchImpl,
    body: messageBody(input.text, 1, input.messageId),
    paymentHeader: input.paymentHeader,
  })
  if (sent.status !== 200) {
    throw new Error(`Paid SendMessage failed ${sent.status} ${sent.text.slice(0, 400)}`)
  }
  return readTask(sent.json)
}

export async function getTask(input: { marketBase: string; handle: string; taskId: string; fetchImpl?: typeof fetch }) {
  const sent = await postA2A({
    marketBase: input.marketBase,
    handle: input.handle,
    fetchImpl: input.fetchImpl,
    body: { jsonrpc: "2.0", id: 2, method: "GetTask", params: { id: input.taskId, historyLength: 0 } },
  })
  assertOk("POST", sent.url, sent)
  return readTask(sent.json)
}
