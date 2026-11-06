import { loadEnvFile } from "../server/config"
import { tickLive } from "../server/live"
import { redact } from "../lib/redact"

loadEnvFile()

const once = process.argv.includes("--once")

async function loop(): Promise<void> {
  await tickLive(true)
  if (once) return
  await new Promise((resolve) => setTimeout(resolve, 30_000))
  return loop()
}

loop().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(redact(message))
  process.exit(1)
})
