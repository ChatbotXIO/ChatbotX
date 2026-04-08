const MAX_SUMMARY_CHARS = 10_000

export function summarizeToolResult(rawContent: unknown): string | null {
  const unwrapped = tryUnwrapMcpResult(rawContent)
  const content = unwrapped === null ? rawContent : unwrapped

  if (content === null || content === undefined) {
    return null
  }

  if (typeof content === "string") {
    const trimmed = content.trim()
    if (trimmed.length === 0) {
      return null
    }

    const parsed = tryParseJsonValue(trimmed)
    if (parsed !== null) {
      return summarizeStructuredValue(parsed)
    }

    return clampTextLength(trimmed)
  }

  if (isRecord(content) || Array.isArray(content)) {
    return summarizeStructuredValue(content)
  }

  // Fallback for other types (boolean, number)
  return String(content)
}

function tryUnwrapMcpResult(value: unknown): unknown | null {
  if (!isRecord(value)) {
    return null
  }

  const success = value.success
  if (success === true) {
    if ("content" in value) {
      return value.content
    }
    return null
  }

  if (success === false) {
    const error = value.error
    if (typeof error === "string") {
      const trimmed = error.trim()
      return trimmed.length > 0 ? trimmed : null
    }
  }

  return null
}

function summarizeStructuredValue(value: unknown): string | null {
  try {
    const jsonString = JSON.stringify(value)
    return clampTextLength(jsonString)
  } catch {
    return null
  }
}

function tryParseJsonValue(text: string): unknown | null {
  const trimmed = text.trim()
  if (
    !(
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    )
  ) {
    return null
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return null
  }
}

function clampTextLength(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= MAX_SUMMARY_CHARS) {
    return trimmed
  }
  return `${trimmed.slice(0, MAX_SUMMARY_CHARS).trim()}...`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
