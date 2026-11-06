import { mcpConnected, missingLive, readConfig } from "../../../server/config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const config = readConfig()
    const missing = missingLive(config)
    if (config.payMode !== "x402" && !mcpConnected()) missing.push("mcp login (npm run mcp-login)")
    return Response.json({
      demoReady: true,
      liveReady: missing.length === 0,
      livePayMode: config.payMode,
      missing,
      mcpConnected: mcpConnected(),
      handles: {
        specialist: config.specialistHandle || null,
        finisher: config.finisherHandle || null,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Config failed"
    return Response.json({ demoReady: true, liveReady: false, missing: [message], mcpConnected: false }, { status: 200 })
  }
}
