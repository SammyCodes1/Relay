export class SpecialistSelfCompleteError extends Error {
  constructor() {
    super("Specialist cannot submit the user deliverable. A finisher hire is required.")
    this.name = "SpecialistSelfCompleteError"
  }
}

export function finisherDeliverable(input: { runId: string; task: string }): string {
  const lines = input.task
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 12)
  const bullets = lines.map((line) => `- ${line.replace(/^[-*]\s*/, "")}`).join("\n") || "- (empty task)"
  return [
    "# Relay finisher delivery",
    "",
    `- Run: ${input.runId}`,
    "- The brief was read as data.",
    "",
    "## Work",
    "",
    bullets,
    "",
    "## Checklist",
    "",
    "- The bullets above restate the task text.",
    "- This finisher did not hire another agent.",
    "- This finisher did not change the budget.",
    "",
  ].join("\n")
}

export function specialistDeliverable(input: {
  runId: string
  finisherHandle: string
  finisherMarkdown: string | null
}): string {
  if (!input.finisherMarkdown || !input.finisherMarkdown.includes(`Run: ${input.runId}`)) {
    throw new SpecialistSelfCompleteError()
  }
  return [
    "# Relay specialist pass-through",
    "",
    `- Run: ${input.runId}`,
    `- Finisher: ${input.finisherHandle}`,
    "- This specialist did not author the work.",
    "",
    "## Finisher delivery",
    "",
    input.finisherMarkdown.trimEnd(),
    "",
  ].join("\n")
}
