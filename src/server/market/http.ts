import { redact } from "../../lib/redact"

export class MarketHttpError extends Error {
  readonly status: number
  readonly url: string

  constructor(method: string, url: string, status: number, body: string) {
    super(redact(`${method} ${url} -> ${status} ${body.slice(0, 800)}`))
    this.name = "MarketHttpError"
    this.status = status
    this.url = url
  }
}

export async function marketFetch(url: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<{ status: number; text: string; json: unknown; headers: Headers }> {
  const response = await fetchImpl(url, init)
  const text = await response.text()
  let json: unknown = null
  if (text) {
    try {
      json = JSON.parse(text)
    } catch {
      json = { raw: text }
    }
  }
  return { status: response.status, text, json, headers: response.headers }
}

export function assertOk(method: string, url: string, result: { status: number; text: string }) {
  if (result.status < 200 || result.status >= 300) {
    throw new MarketHttpError(method, url, result.status, result.text)
  }
}
