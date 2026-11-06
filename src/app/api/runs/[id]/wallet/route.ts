import { redact } from "../../../../../lib/redact"
import { prepareWalletChallenge } from "../../../../../server/live"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  const body = (await request.json()) as { hop?: "A" | "B" }
  if (body.hop !== "A" && body.hop !== "B") {
    return Response.json({ error: "hop must be A or B" }, { status: 400 })
  }
  try {
    const challenge = await prepareWalletChallenge(id, body.hop)
    return Response.json(challenge)
  } catch (error) {
    return Response.json({ error: redact(error instanceof Error ? error.message : "Wallet quote failed") }, { status: 400 })
  }
}
