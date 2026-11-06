import { confirmRun } from "../../../../../server/live"
import { publicRun } from "../../../../../lib/types"
import { redact } from "../../../../../lib/redact"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = (await request.json()) as { hop?: "A" | "B" | "accept"; signedDelegateAction?: string }
  if (body.hop !== "A" && body.hop !== "B" && body.hop !== "accept") {
    return Response.json({ error: "hop must be A, B, or accept" }, { status: 400 })
  }
  try {
    const run = await confirmRun(id, body.hop, body.signedDelegateAction)
    return Response.json(publicRun(run))
  } catch (error) {
    return Response.json({ error: redact(error instanceof Error ? error.message : "Confirm failed") }, { status: 400 })
  }
}
