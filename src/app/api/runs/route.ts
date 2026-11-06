import { demoQuote, runRelay, type RelayPort } from "../../../lib/relay"
import { parseUsdc } from "../../../lib/money"
import type { Scenario } from "../../../lib/types"
import { readConfig } from "../../../server/config"
import { createLiveRun } from "../../../server/live"
import { saveRun } from "../../../server/store"
import { publicRun } from "../../../lib/types"
import { redact } from "../../../lib/redact"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SCENARIOS: Scenario[] = ["happy", "counter", "walkaway", "self_complete", "injection"]

export async function POST(request: Request) {
  const body = (await request.json()) as { task?: string; budget?: string; mode?: string; scenario?: string }
  const task = (body.task ?? "").trim()
  const budget = (body.budget ?? "").trim()
  if (!task) return Response.json({ error: "Task is required" }, { status: 400 })
  if (body.mode === "live") {
    try {
      const run = await createLiveRun(task, budget)
      return Response.json(publicRun(run))
    } catch (error) {
      return Response.json({ error: redact(error instanceof Error ? error.message : "Live run failed") }, { status: 400 })
    }
  }
  const scenario = SCENARIOS.includes(body.scenario as Scenario) ? (body.scenario as Scenario) : "happy"
  try {
    const config = readConfig()
    const specialist = config.specialistHandle || "relay-specialist"
    const finisher = config.finisherHandle || "relay-finisher"
    const atomic = parseUsdc(budget)
    const hired: string[] = []
    const port: RelayPort = {
      quote: async (handle) => {
        if (handle !== specialist && handle !== finisher) throw new Error(`Refusing to quote ${handle}`)
        return demoQuote(scenario, handle === specialist ? "A" : "B", atomic)
      },
      hire: async (handle) => {
        hired.push(handle)
        return { ref: handle, url: null }
      },
      submit: async () => undefined,
    }
    const run = await runRelay({ task, budget, scenario, specialistHandle: specialist, finisherHandle: finisher, port })
    if (scenario === "injection" && hired.some((handle) => handle !== specialist && handle !== finisher)) {
      return Response.json({ error: "Injection changed the hire handle" }, { status: 500 })
    }
    await saveRun(run)
    return Response.json(publicRun(run))
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Demo run failed" }, { status: 400 })
  }
}
