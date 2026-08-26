// Postgres jsonb does not preserve object-key order, so comparing DB-read
// values against freshly-built payloads with plain JSON.stringify produces
// false positives whenever the key order differs. Sort keys recursively
// before comparing so the diff reflects real content changes only.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    )
    return `{${entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`).join(",")}}`
  }
  return JSON.stringify(value)
}

export function isSameJsonValue(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b)
}
