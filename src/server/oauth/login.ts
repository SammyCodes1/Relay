import { createHash, randomBytes } from "crypto"
import { createServer } from "http"
import { execFile } from "child_process"
import fs from "fs"
import path from "path"
import { loadEnvFile, oauthPath } from "../config"

loadEnvFile()

const base = (process.env.MARKET_BASE_URL ?? "https://market.near.ai").replace(/\/$/, "")
const redirectUri = "http://127.0.0.1:8788/callback"
const scope = "mcp hiring"

async function postForm(url: string, body: URLSearchParams) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
  })
  const text = await response.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  return { status: response.status, text, json }
}

async function register(): Promise<string> {
  const response = await fetch(`${base}/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_name: "Relay local",
      grant_types: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      redirect_uris: [redirectUri],
      scope,
    }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`POST ${base}/oauth/register -> ${response.status} ${text.slice(0, 500)}`)
  const json = JSON.parse(text) as { client_id?: string }
  if (!json.client_id) throw new Error("OAuth registration returned no client_id")
  return json.client_id
}

function save(clientId: string, token: { access_token?: string; refresh_token?: string; expires_in?: number }) {
  if (!token.access_token) throw new Error("Token response had no access_token")
  const file = oauthPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify({
    clientId,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
  }, null, 2))
  console.log(`Saved a marketplace token to ${file}. The token is not printed.`)
}

async function browserLogin(clientId: string) {
  const verifier = randomBytes(32).toString("base64url")
  const challenge = createHash("sha256").update(verifier).digest("base64url")
  const state = randomBytes(16).toString("hex")
  const url = new URL(`${base}/oauth/authorize`)
  url.searchParams.set("response_type", "code")
  url.searchParams.set("client_id", clientId)
  url.searchParams.set("redirect_uri", redirectUri)
  url.searchParams.set("scope", scope)
  url.searchParams.set("state", state)
  url.searchParams.set("code_challenge", challenge)
  url.searchParams.set("code_challenge_method", "S256")
  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      const request = new URL(req.url ?? "/", redirectUri)
      if (request.pathname !== "/callback") {
        res.writeHead(404).end()
        return
      }
      const got = request.searchParams.get("code")
      const gotState = request.searchParams.get("state")
      res.writeHead(200, { "content-type": "text/plain" })
      res.end(got && gotState === state ? "Relay is signed in. You can close this tab." : "Relay sign-in failed. Check the terminal.")
      server.close()
      if (!got || gotState !== state) reject(new Error("OAuth callback was missing the code"))
      else resolve(got)
    })
    server.on("error", (error: NodeJS.ErrnoException) => {
      server.close()
      reject(error.code === "EADDRINUSE"
        ? new Error("The local callback port 8788 is already in use. Stop the old login and run npm run mcp-login again.")
        : error)
    })
    server.listen(8788, "127.0.0.1", () => {
      console.log("Open this URL and approve Relay as yourself, the buyer:")
      console.log(url.toString())
      execFile("cmd", ["/c", "start", "", url.toString()])
    })
    setTimeout(() => {
      server.close()
      reject(new Error("Timed out waiting for the OAuth callback"))
    }, 5 * 60 * 1000).unref()
  })
  const token = await postForm(`${base}/oauth/token`, new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: verifier,
  }))
  if (token.status !== 200) throw new Error(`Token exchange -> ${token.status} ${token.text.slice(0, 400)}`)
  save(clientId, token.json as { access_token?: string; refresh_token?: string; expires_in?: number })
}

async function main() {
  const clientId = await register()
  // Device codes are refused for non-admin accounts: "Signing a headless client or a pipeline in is open to administrators only."
  await browserLogin(clientId)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
