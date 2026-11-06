export function checkQuality(input: {
  runId: string
  task: string
  markdown: string
  finisherHireCount: number
}): { pass: boolean; reasons: string[] } {
  const reasons: string[] = []
  if (input.finisherHireCount !== 1) reasons.push("expected exactly one finisher hire")
  if (!input.markdown.includes(`Run: ${input.runId}`)) reasons.push("missing run id")
  if (!input.markdown.includes("## Work")) reasons.push("missing Work section")
  if (input.markdown.includes("SPECIALIST_SELF_AUTHORED")) reasons.push("specialist authored the work")
  const taskLine = input.task.trim().split(/\r?\n/)[0]?.trim() ?? ""
  const snippet = taskLine.slice(0, 80)
  if (snippet && !input.markdown.includes(snippet)) reasons.push("work does not include the task")
  if (input.markdown.trim().length < 20) reasons.push("deliverable too small")
  return { pass: reasons.length === 0, reasons }
}

export type ReceiptOutcome = "pass" | "fail" | "walked_away" | "pending" | "quality_failed_settled"

export function receiptOutcome(input: {
  walkedAway: boolean
  qualityPass: boolean | null
  settled: boolean
}): { outcome: ReceiptOutcome; successfulPaidHire: boolean } {
  if (input.walkedAway) return { outcome: "walked_away", successfulPaidHire: false }
  if (input.qualityPass === null) return { outcome: "pending", successfulPaidHire: false }
  if (!input.qualityPass && input.settled) return { outcome: "quality_failed_settled", successfulPaidHire: false }
  if (!input.qualityPass) return { outcome: "fail", successfulPaidHire: false }
  if (input.settled) return { outcome: "pass", successfulPaidHire: true }
  return { outcome: "pending", successfulPaidHire: false }
}
