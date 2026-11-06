import { listRuns } from "../../../server/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const runs = await listRuns()
  const receipts = runs.flatMap((run) => run.receipts)
  return Response.json({ receipts })
}
