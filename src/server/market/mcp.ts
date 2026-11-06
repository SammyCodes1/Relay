import fs from "fs"
import path from "path"
import { oauthPath, type AppConfig } from "../config"
import { marketFetch } from "./http"
import { redact } from "../../lib/redact"

interface OAuthFile {
  clientId: string
  accessToken: string
  refreshToken?: string
  expiresAt?: number
}

export function readOAuth(): OAuthFile | null {
  const file = oauthPath()
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as OAuthFile
  const accessToken = process.env.MARKET_MCP_ACCESS_TOKEN
  const clientId = process.env.MARKET_MCP_CLIENT_ID
  if (!accessToken || !clientId) return null
  const expiresAt = process.env.MARKET_MCP_EXPIRES_AT
  return {
    clientId,
    accessToken,
    refreshToken: process.env.MARKET_MCP_REFRESH_TOKEN,
    expiresAt: expiresAt ? Number(expiresAt) : undefined,
  }
}

function mcpDir() {
  return path.dirname(oauthPath())
}

async function refreshIfNeeded(config: AppConfig, auth: OAuthFile): Promise<OAuthFile> {
  if (!auth.expiresAt || !auth.refreshToken || auth.expiresAt - Date.now() > 60_000) return auth
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: auth.refreshToken,
    client_id: auth.clientId,
  })
  const result = await marketFetch(`${config.marketBase}/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  })
  if (result.status !== 200) {
    throw new Error(redact(`OAuth refresh failed ${result.status} ${result.text.slice(0, 400)}`))
  }
  const json = result.json as { access_token?: string; refresh_token?: string; expires_in?: number }
  if (!json.access_token) throw new Error("OAuth refresh returned no access token")
  const next: OAuthFile = {
    clientId: auth.clientId,
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? auth.refreshToken,
    expiresAt: json.expires_in ? Date.now() + json.expires_in * 1000 : undefined,
  }
  try {
    fs.mkdirSync(mcpDir(), { recursive: true })
    fs.writeFileSync(oauthPath(), JSON.stringify(next, null, 2))
  } catch {
    // Vercel cannot keep the refreshed token on disk. This call still uses it.
  }
  return next
}

function parseRpc(contentType: string, text: string): unknown {
  if (!text) throw new Error("MCP response was empty")
  if (contentType.includes("text/event-stream")) {
    const data = text
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean)
    const last = data[data.length - 1]
    if (!last) throw new Error("MCP event stream had no data")
    return JSON.parse(last)
  }
  return JSON.parse(text)
}

export class MarketMcp {
  private sessionId: string | null = null
  private protocol = "2025-03-26"
  private nextId = 1
  private auth: OAuthFile

  private constructor(private config: AppConfig, auth: OAuthFile) {
    this.auth = auth
  }

  static async connect(config: AppConfig): Promise<MarketMcp> {
    const auth = readOAuth()
    if (!auth?.accessToken) {
      throw new Error("No marketplace OAuth token. Run npm run mcp-login.")
    }
    const fresh = await refreshIfNeeded(config, auth)
    return new MarketMcp(config, fresh)
  }

  private async rpc(method: string, params: unknown, notify = false): Promise<unknown> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${this.auth.accessToken}`,
      "MCP-Protocol-Version": this.protocol,
    }
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId
    const body = notify
      ? { jsonrpc: "2.0", method }
      : { jsonrpc: "2.0", id: this.nextId++, method, params }
    const result = await marketFetch(this.config.mcpUrl, { method: "POST", headers, body: JSON.stringify(body) })
    const session = result.headers.get("mcp-session-id")
    if (session) this.sessionId = session
    if (result.status === 401) throw new Error("Marketplace MCP returned 401. Run npm run mcp-login again.")
    if (result.status < 200 || result.status >= 300) {
      throw new Error(redact(`MCP ${method} -> ${result.status} ${result.text.slice(0, 500)}`, [this.auth.accessToken]))
    }
    if (notify || !result.text) return null
    const payload = parseRpc(result.headers.get("content-type") ?? "", result.text) as {
      error?: { code?: number; message?: string }
      result?: unknown
    }
    if (payload.error) {
      throw new Error(`MCP ${payload.error.code ?? ""} ${payload.error.message ?? "error"}`.trim())
    }
    return payload.result
  }

  private async ready() {
    if (this.sessionId) return
    const result = (await this.rpc("initialize", {
      protocolVersion: this.protocol,
      capabilities: {},
      clientInfo: { name: "relay", version: "0.1.0" },
    })) as { protocolVersion?: string }
    if (result?.protocolVersion) this.protocol = result.protocolVersion
    await this.rpc("notifications/initialized", {}, true)
  }

  async tool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.ready()
    const result = (await this.rpc("tools/call", { name, arguments: args })) as {
      content?: Array<{ type?: string; text?: string }>
      isError?: boolean
    }
    const text = (result.content ?? []).filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n")
    let parsed: unknown = text
    try {
      parsed = text ? JSON.parse(text) : {}
    } catch {
      parsed = { text }
    }
    if (result.isError) {
      const message = typeof parsed === "object" && parsed && "message" in parsed ? String((parsed as { message: unknown }).message) : text
      throw new Error(redact(message || `MCP tool ${name} refused`, [this.auth.accessToken]))
    }
    return parsed
  }
}
