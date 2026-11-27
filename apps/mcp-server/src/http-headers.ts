export const resolveHeaderValue = (
  value: string | string[] | undefined,
): string => {
  if (typeof value === "string") {
    return value.trim()
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const trimmed = item.trim()
      if (trimmed.length > 0) {
        return trimmed
      }
    }
  }

  return ""
}
