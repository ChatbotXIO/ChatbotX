export type HighlightPart = { text: string; match: boolean }

/**
 * Splits `content` around case-insensitive occurrences of `expected` so the UI
 * can mark the expected answer. Matching mirrors the server's ILIKE: accents
 * matter, case does not.
 */
export function splitByExpected(
  content: string,
  expected: string | null | undefined,
): HighlightPart[] {
  const needle = expected?.trim().toLowerCase()
  if (!needle) {
    return [{ text: content, match: false }]
  }
  const haystack = content.toLowerCase()
  // Lowercasing can change the length for a few characters; fall back to plain text.
  if (haystack.length !== content.length) {
    return [{ text: content, match: false }]
  }
  const parts: HighlightPart[] = []
  let cursor = 0
  let found = haystack.indexOf(needle, cursor)
  while (found !== -1) {
    if (found > cursor) {
      parts.push({ text: content.slice(cursor, found), match: false })
    }
    parts.push({
      text: content.slice(found, found + needle.length),
      match: true,
    })
    cursor = found + needle.length
    found = haystack.indexOf(needle, cursor)
  }
  if (cursor < content.length) {
    parts.push({ text: content.slice(cursor), match: false })
  }
  return parts
}
