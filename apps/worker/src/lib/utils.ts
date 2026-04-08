export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function ensureRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}
