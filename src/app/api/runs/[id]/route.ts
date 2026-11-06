import { publicRun } from "../../../../lib/types"
import { loadRun } from "../../../../server/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const run = await loadRun(id)
  if (!run) return Response.json({ error: "Unknown run" }, { status: 404 })
  return Response.json(publicRun(run))
}
