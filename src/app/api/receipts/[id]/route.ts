import { listRuns } from "../../../../server/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const runs = await listRuns()
  for (const run of runs) {
    const receipt = run.receipts.find((item) => item.id === id)
    if (receipt) return Response.json({ receipt, runId: run.id, task: run.task, mode: run.mode })
  }
  return Response.json({ error: "Unknown receipt" }, { status: 404 })
}
