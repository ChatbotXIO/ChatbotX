export function formatErrorContent(errorContent: string): string {
  try {
    const parsed: unknown = JSON.parse(errorContent)
    if (
      parsed &&
      typeof parsed === "object" &&
      "message" in parsed &&
      typeof parsed.message === "string" &&
      parsed.message.trim()
    ) {
      return parsed.message
    }
  } catch {
    return errorContent
  }

  return errorContent
}
