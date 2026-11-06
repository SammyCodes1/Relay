import fs from "fs"
import path from "path"
import type { Run } from "../lib/types"

const root = path.join(process.cwd(), "data")
const runsDir = path.join(root, "runs")
const lockPath = path.join(root, "store.lock")

async function ensure() {
  await fs.promises.mkdir(runsDir, { recursive: true })
}

async function clearStaleLock() {
  try {
    const stat = await fs.promises.stat(lockPath)
    if (Date.now() - stat.mtimeMs > 20_000) await fs.promises.unlink(lockPath)
  } catch {
    // No lock file is the normal case.
  }
}

async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  await ensure()
  for (let attempt = 0; attempt < 200; attempt += 1) {
    await clearStaleLock()
    try {
      const handle = await fs.promises.open(lockPath, "wx")
      try {
        return await fn()
      } finally {
        await handle.close()
        await fs.promises.unlink(lockPath).catch(() => undefined)
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== "EEXIST") throw error
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error("Timed out waiting for the local run store")
}

function fileFor(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Unknown run")
  return path.join(runsDir, `${id}.json`)
}

export async function saveRun(run: Run, baseUpdatedAt?: string): Promise<boolean> {
  return withLock(async () => {
    const file = fileFor(run.id)
    if (baseUpdatedAt && fs.existsSync(file)) {
      const current = JSON.parse(await fs.promises.readFile(file, "utf8")) as Run
      if (current.updatedAt !== baseUpdatedAt) return false
    }
    run.updatedAt = new Date().toISOString()
    const tmp = `${file}.tmp`
    await fs.promises.writeFile(tmp, JSON.stringify(run, null, 2))
    await fs.promises.rename(tmp, file)
    return true
  })
}

export async function loadRun(id: string): Promise<Run | null> {
  await ensure()
  const file = fileFor(id)
  if (!fs.existsSync(file)) return null
  const text = await fs.promises.readFile(file, "utf8")
  return JSON.parse(text) as Run
}

export async function listRuns(): Promise<Run[]> {
  await ensure()
  const names = await fs.promises.readdir(runsDir)
  const runs: Run[] = []
  for (const name of names) {
    if (!name.endsWith(".json")) continue
    const text = await fs.promises.readFile(path.join(runsDir, name), "utf8")
    runs.push(JSON.parse(text) as Run)
  }
  runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return runs
}

export async function updateRun(id: string, change: (run: Run) => Promise<void> | void): Promise<Run> {
  return withLock(async () => {
    const file = fileFor(id)
    if (!fs.existsSync(file)) throw new Error("Unknown run")
    const run = JSON.parse(await fs.promises.readFile(file, "utf8")) as Run
    await change(run)
    run.updatedAt = new Date().toISOString()
    const tmp = `${file}.tmp`
    await fs.promises.writeFile(tmp, JSON.stringify(run, null, 2))
    await fs.promises.rename(tmp, file)
    return run
  })
}
