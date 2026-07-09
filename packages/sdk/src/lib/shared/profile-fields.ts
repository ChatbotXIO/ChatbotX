// FB returns timezone as float hours offset from UTC (for example 7 or -3.5).
// Store as ISO offset string so date-fns-tz can format with it.
export const normalizeUtcOffset = (offset?: number): string | undefined => {
  if (offset === undefined || !Number.isFinite(offset)) {
    return
  }

  const sign = offset < 0 ? "-" : "+"
  const abs = Math.abs(offset)
  const hours = Math.trunc(abs)
  const minutes = Math.round((abs - hours) * 60)
  const pad = (n: number) => String(n).padStart(2, "0")

  return `${sign}${pad(hours)}:${pad(minutes)}`
}

const ALLOWED_GENDERS = new Set(["male", "female", "unknown"])

export const normalizeGender = (gender?: string): string | undefined => {
  const normalized = gender?.toLowerCase()
  return normalized && ALLOWED_GENDERS.has(normalized) ? normalized : undefined
}
