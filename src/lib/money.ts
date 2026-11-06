const SCALE = 6
const BASE = 10n ** BigInt(SCALE)

/** Parse a USDC decimal string into atomic units (6 decimals). Extra trailing zeros are allowed. */
export function parseUsdc(input: string): bigint {
  const s = input.trim()
  if (!/^\d+(\.\d+)?$/.test(s)) {
    throw new Error("Amount must be a USDC decimal like 1.00")
  }
  const [whole, frac = ""] = s.split(".")
  const head = frac.slice(0, SCALE)
  const tail = frac.slice(SCALE)
  if (/[1-9]/.test(tail)) {
    throw new Error("USDC supports 6 decimal places")
  }
  const atomic = BigInt(whole) * BASE + BigInt(head.padEnd(SCALE, "0"))
  if (atomic <= 0n) {
    throw new Error("Amount must be greater than zero")
  }
  return atomic
}

export function parseUsdcLoose(input: string | null | undefined): bigint {
  if (input == null) return 0n
  const s = input.trim()
  if (s === "" || /^0+(\.0+)?$/.test(s)) return 0n
  return parseUsdc(s)
}

export function formatUsdc(atomic: bigint): string {
  const sign = atomic < 0n ? "-" : ""
  const value = atomic < 0n ? -atomic : atomic
  const whole = value / BASE
  const fracFull = (value % BASE).toString().padStart(SCALE, "0")
  const trimmed = fracFull.replace(/0+$/, "")
  const frac = trimmed.length < 2 ? fracFull.slice(0, 2) : trimmed
  return `${sign}${whole.toString()}.${frac}`
}

export function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b
}
