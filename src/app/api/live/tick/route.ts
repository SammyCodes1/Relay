import { tickLive } from "../../../../server/live"
import { redact } from "../../../../lib/redact"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST() {
  try {
    await tickLive(false)
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json({ error: redact(error instanceof Error ? error.message : "Tick failed") }, { status: 500 })
  }
}
