export interface RelayEnvelope {
  v: 1
  runId: string
  task: string
  finisherHandle: string
  hopBBudget: string
}

export function embedEnvelope(title: string, envelope: RelayEnvelope): string {
  return `${title}\n\n\`\`\`json\n${JSON.stringify({ relay: envelope })}\n\`\`\`\n`
}

export function parseEnvelope(description: string): RelayEnvelope | null {
  const match = description.match(/```json\s*([\s\S]*?)```/)
  if (!match) return null
  try {
    const parsed: unknown = JSON.parse(match[1])
    if (!parsed || typeof parsed !== "object" || !("relay" in parsed)) return null
    const relay = (parsed as { relay: unknown }).relay
    if (!relay || typeof relay !== "object") return null
    const row = relay as Record<string, unknown>
    if (row.v !== 1) return null
    if (typeof row.runId !== "string" || typeof row.task !== "string") return null
    if (typeof row.finisherHandle !== "string" || typeof row.hopBBudget !== "string") return null
    return {
      v: 1,
      runId: row.runId,
      task: row.task,
      finisherHandle: row.finisherHandle,
      hopBBudget: row.hopBBudget,
    }
  } catch {
    return null
  }
}
