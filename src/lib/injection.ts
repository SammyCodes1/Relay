const PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /ignore (all |any )?(previous|prior|above) instructions/i, label: "ignore previous instructions" },
  { re: /raise the budget/i, label: "raise the budget" },
  { re: /hire (someone else|another agent|an extra|a second)/i, label: "hire someone else" },
  { re: /\bhire\s+[a-z0-9][a-z0-9-]*/i, label: "hire named in the brief" },
]

/** Record instruction-shaped text. Callers must not act on it. */
export function findRejectedInstructions(task: string): string[] {
  const found: string[] = []
  for (const pattern of PATTERNS) {
    if (pattern.re.test(task)) found.push(pattern.label)
  }
  return found
}
