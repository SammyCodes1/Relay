import { assertOk, marketFetch } from "./http"

export interface CatalogAgent {
  agentId: string
  handle: string
  name: string
  availableNow: boolean
}

export function assertHandle(handle: string): string {
  if (!/^[a-z][a-z0-9-]{1,28}[a-z0-9]$/.test(handle) || handle.includes("--")) {
    throw new Error("Agent handle is not a marketplace handle")
  }
  return handle
}

export function agentHost(marketBase: string, handle: string): string {
  const host = new URL(marketBase).host
  return `https://${assertHandle(handle)}.${host}`
}

export async function findAgent(marketBase: string, handle: string, fetchImpl: typeof fetch = fetch): Promise<CatalogAgent> {
  assertHandle(handle)
  const url = `${marketBase}/v1/agents?q=${encodeURIComponent(handle)}&limit=20`
  const result = await marketFetch(url, { headers: { accept: "application/json" } }, fetchImpl)
  assertOk("GET", url, result)
  const agents = (result.json as { agents?: Array<Record<string, unknown>> }).agents ?? []
  const exact = agents.find((agent) => agent.handle === handle)
  if (!exact || typeof exact.agent_id !== "string") {
    throw new Error(`No listed agent with handle ${handle}`)
  }
  return {
    agentId: exact.agent_id,
    handle,
    name: typeof exact.name === "string" ? exact.name : handle,
    availableNow: exact.available_now === true,
  }
}

export async function defaultPlanAmount(marketBase: string, agentId: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const url = `${marketBase}/v1/agents/${agentId}/pricing-plans`
  const result = await marketFetch(url, { headers: { accept: "application/json" } }, fetchImpl)
  assertOk("GET", url, result)
  if (!Array.isArray(result.json)) throw new Error("Pricing plans response was not a list")
  const plan = result.json.find((row) => {
    const item = row as { is_default?: boolean; listing_status?: string }
    return item.is_default === true && item.listing_status === "live"
  }) as { price_amount?: string } | undefined
  if (!plan?.price_amount) throw new Error("Agent has no live default pricing plan")
  return plan.price_amount
}

export async function readAgentCard(marketBase: string, handle: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const url = `${agentHost(marketBase, handle)}/.well-known/agent-card.json`
  const result = await marketFetch(url, { headers: { accept: "application/json" } }, fetchImpl)
  if (result.status === 404) throw new Error(`No agent card for ${handle}`)
  assertOk("GET", url, result)
}
