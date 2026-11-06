import fs from "fs"
import path from "path"

export type LivePayMode = "mcp-prepare" | "mcp-pro" | "x402"

export interface AppConfig {
  marketBase: string
  payMode: LivePayMode
  mcpUrl: string
  specialistHandle: string
  finisherHandle: string
  specialistToken: string
  finisherToken: string
  x402Account: string
  x402Key: string
  x402Network: string
}

let loaded = false

export function loadEnvFile() {
  if (loaded) return
  loaded = true
  const file = path.join(process.cwd(), ".env")
  if (!fs.existsSync(file)) return
  const text = fs.readFileSync(file, "utf8")
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}

export function readConfig(): AppConfig {
  loadEnvFile()
  const payMode = process.env.LIVE_PAY_MODE ?? "mcp-prepare"
  if (payMode !== "mcp-prepare" && payMode !== "mcp-pro" && payMode !== "x402") {
    throw new Error("LIVE_PAY_MODE must be mcp-prepare, mcp-pro, or x402")
  }
  const mcpDefault = payMode === "mcp-pro" ? "https://market.near.ai/mcp/pro" : "https://market.near.ai/mcp"
  return {
    marketBase: (process.env.MARKET_BASE_URL ?? "https://market.near.ai").replace(/\/$/, ""),
    payMode,
    mcpUrl: process.env.MARKET_MCP_URL ?? mcpDefault,
    specialistHandle: process.env.RELAY_SPECIALIST_HANDLE ?? "",
    finisherHandle: process.env.RELAY_FINISHER_HANDLE ?? "",
    specialistToken: process.env.SPECIALIST_AGENT_API_TOKEN ?? "",
    finisherToken: process.env.FINISHER_AGENT_API_TOKEN ?? "",
    x402Account: process.env.X402_ACCOUNT_ID ?? "",
    x402Key: process.env.X402_PRIVATE_KEY ?? "",
    x402Network: process.env.X402_NETWORK ?? "",
  }
}

export function missingLive(config: AppConfig): string[] {
  const missing: string[] = []
  if (!config.specialistHandle) missing.push("RELAY_SPECIALIST_HANDLE")
  if (!config.finisherHandle) missing.push("RELAY_FINISHER_HANDLE")
  if (!config.specialistToken) missing.push("SPECIALIST_AGENT_API_TOKEN")
  if (!config.finisherToken) missing.push("FINISHER_AGENT_API_TOKEN")
  if (config.payMode === "x402") {
    if (!config.x402Account) missing.push("X402_ACCOUNT_ID")
    if (!config.x402Key) missing.push("X402_PRIVATE_KEY")
  }
  return missing
}

export function oauthPath() {
  return path.join(process.cwd(), "data", "mcp-oauth.json")
}

export function mcpConnected(): boolean {
  return fs.existsSync(oauthPath())
}
