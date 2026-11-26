const ON_WROTE_LINE = /^on\s.+wrote:\s*$/i
const ON_WROTE_START = /^on\s.+/i
const WROTE_ONLY_LINE = /^\s*wrote:\s*$/i
const ORIGINAL_MESSAGE = /^\s*-{2,}\s*original message\s*-{2,}\s*$/i
const FORWARDED_RULE = /^\s*_{10,}\s*$/
const OUTLOOK_FROM = /^\s*from:\s.+/i
const OUTLOOK_SENT = /^\s*(sent|date):\s.+/i
const QUOTE_LINE = /^\s*>/
const LINE_BREAK = /\r?\n/

const isHeaderBreak = (lines: string[], index: number): boolean => {
  const line = lines[index]
  if (ORIGINAL_MESSAGE.test(line) || FORWARDED_RULE.test(line)) {
    return true
  }
  if (ON_WROTE_LINE.test(line)) {
    return true
  }
  // "On Mon, 3 Nov 2026 at 10:00, Jane <j@x.com>\nwrote:" wrapped by the client.
  if (
    ON_WROTE_START.test(line) &&
    WROTE_ONLY_LINE.test(lines[index + 1] ?? "")
  ) {
    return true
  }
  // Outlook: a "From:" line directly followed by "Sent:" / "Date:".
  return OUTLOOK_FROM.test(line) && OUTLOOK_SENT.test(lines[index + 1] ?? "")
}

const isTrailingQuoteBlock = (lines: string[], index: number): boolean => {
  if (!QUOTE_LINE.test(lines[index])) {
    return false
  }
  return lines
    .slice(index)
    .every((line) => line.trim() === "" || QUOTE_LINE.test(line))
}

/**
 * Cuts the quoted history off a reply so the inbox shows only what the sender
 * just wrote. Heuristic by design: when nothing new would be left, the full
 * text is returned instead so a message is never shown empty.
 */
export const stripQuotedReply = (text: string): string => {
  const lines = text.split(LINE_BREAK)
  const cutAt = lines.findIndex(
    (_, index) =>
      isHeaderBreak(lines, index) || isTrailingQuoteBlock(lines, index),
  )
  if (cutAt === -1) {
    return text.trim()
  }
  const stripped = lines.slice(0, cutAt).join("\n").trim()
  return stripped === "" ? text.trim() : stripped
}
