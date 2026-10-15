const isEmptyValue = (value: unknown): boolean =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "") ||
  (Array.isArray(value) && value.length === 0)

/** Drops empty strings, empty arrays and undefined values (Meta rejects blank strings). */
export const cleanObject = (
  value: Record<string, unknown>,
): Record<string, unknown> => {
  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (isEmptyValue(entry)) {
      continue
    }
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const nested = cleanObject(entry as Record<string, unknown>)
      if (Object.keys(nested).length > 0) {
        result[key] = nested
      }
      continue
    }
    if (Array.isArray(entry)) {
      result[key] = entry.map((item) =>
        item && typeof item === "object"
          ? cleanObject(item as Record<string, unknown>)
          : item,
      )
      continue
    }
    result[key] = entry
  }
  return result
}
