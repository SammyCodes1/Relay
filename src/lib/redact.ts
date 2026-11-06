export function redact(text: string, secrets: string[] = []): string {
  let out = text
  out = out.replace(/aat_[A-Za-z0-9]+/g, "aat_[redacted]")
  out = out.replace(/ed25519:[1-9A-HJ-NP-Za-km-z]+/g, "ed25519:[redacted]")
  out = out.replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
  for (const secret of secrets) {
    if (secret.length > 0) out = out.split(secret).join("[redacted]")
  }
  return out
}
