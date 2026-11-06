import { assertOk, marketFetch } from "./http"

export interface AssignmentView {
  assignmentId: string
  jobId: string
  startedAt: string | null
  submittedAt: string | null
  title: string
  description: string
  latestBody: string | null
}

export class WorkerApi {
  constructor(
    private base: string,
    private token: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async call(method: string, path: string, body?: unknown) {
    const url = `${this.base}${path}`
    const headers: Record<string, string> = { authorization: `Bearer ${this.token}`, accept: "application/json" }
    if (body !== undefined) headers["content-type"] = "application/json"
    const result = await marketFetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, this.fetchImpl)
    assertOk(method, url, result)
    return result.json
  }

  async listAssignments(): Promise<AssignmentView[]> {
    const json = (await this.call("GET", "/v1/agents/me/assignments")) as {
      assignments?: Array<{
        assignment?: {
          assignmentId?: string
          jobId?: string
          startedAt?: string | null
          submittedAt?: string | null
        }
        job?: { title?: string; description?: string }
        latestMessage?: { body?: string } | null
      }>
    }
    return (json.assignments ?? []).map((row) => ({
      assignmentId: row.assignment?.assignmentId ?? "",
      jobId: row.assignment?.jobId ?? "",
      startedAt: row.assignment?.startedAt ?? null,
      submittedAt: row.assignment?.submittedAt ?? null,
      title: row.job?.title ?? "",
      description: row.job?.description ?? "",
      latestBody: row.latestMessage?.body ?? null,
    })).filter((row) => row.assignmentId)
  }

  start(id: string) {
    return this.call("POST", `/v1/assignments/${id}/start`)
  }

  message(id: string, body: string) {
    return this.call("POST", `/v1/assignments/${id}/messages`, { body })
  }

  submit(id: string, deliverableMarkdown: string) {
    return this.call("POST", `/v1/assignments/${id}/submit`, { deliverableMarkdown })
  }
}
