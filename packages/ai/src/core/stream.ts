import { supportedImageExtensions } from "../schemas"

const REGEX_ANY_TOKEN =
  /!\[[^\]]*\]\(\s*([^)\s\r\n]+)\s*\)|\[[^\]]+\]\(\s*([^)\s\r\n]+)\s*\)|(https?:\/\/[^\s)\]]+(?:\?[^\s)\]]*)?)/g
const REGEX_ONLY_WHITESPACE = /^\s*$/
const REGEX_ONLY_EMOJI = /^[\u{1F300}-\u{1F9FF}]+$/u
const REGEX_STARS_OR_DASHES = /^[-*]\s*/u
const REGEX_NOISY_CHARS = /^[-*.\s]+$/
const PARAGRAPH_SEPARATOR = "\n\n"

type StreamProcessingOptions = {
  sendParts?: boolean
  trackingContext?: unknown
}

function isMeaningfulPart(part: string): boolean {
  if (!part) {
    return false
  }
  if (REGEX_ONLY_WHITESPACE.test(part)) {
    return false
  }
  if (REGEX_ONLY_EMOJI.test(part)) {
    return false
  }
  if (REGEX_NOISY_CHARS.test(part)) {
    return false
  }
  return true
}

function getMeaningfulParts(parts: string[]): string[] {
  const normalized: string[] = []
  for (const part of parts) {
    const trimmed = part.trim()
    if (!isMeaningfulPart(trimmed)) {
      continue
    }
    normalized.push(trimmed)
  }
  return normalized
}

function cleanText(value: string): string {
  return String(value ?? "")
    .replace(REGEX_STARS_OR_DASHES, "")
    .trim()
}

export function isImageUrl(url: string): boolean {
  const s = url.trim().toLowerCase()
  if (!(s.startsWith("http://") || s.startsWith("https://"))) {
    return false
  }
  try {
    const u = new URL(s)
    const p = u.pathname.toLowerCase()

    return supportedImageExtensions.options.some((ext) => p.endsWith(`.${ext}`))
  } catch {
    return false
  }
}

export function processTextForImagesAndLinks(text: string): string[] {
  if (!text) {
    return []
  }

  const parts: string[] = []
  const seenUrls = new Set<string>()
  const tokenRegex = new RegExp(REGEX_ANY_TOKEN.source, REGEX_ANY_TOKEN.flags)
  let cursor = 0

  for (const match of text.matchAll(tokenRegex)) {
    const start = match.index ?? 0
    const token = match[0] ?? ""

    if (start > cursor) {
      const before = cleanText(text.slice(cursor, start))
      if (before) {
        parts.push(before)
      }
    }

    const url = (match[1] || match[2] || match[3] || "").trim()
    if (url && !seenUrls.has(url)) {
      seenUrls.add(url)
      parts.push(url)
    }

    cursor = start + token.length
  }

  if (cursor < text.length) {
    const tail = cleanText(text.slice(cursor))
    if (tail) {
      parts.push(tail)
    }
  }

  return getMeaningfulParts(parts)
}

export async function processStreamingText(
  textStream: AsyncIterable<string>,
  onSegment: (segment: string, parts: string[]) => Promise<void>,
  options?: StreamProcessingOptions,
): Promise<{ messageCount: number; fullText: string }> {
  let fullText = ""
  let messageCount = 0
  const sendParts = options?.sendParts !== false
  let currentSegment = ""

  const handleSegment = async (segment: string) => {
    const parts = processTextForImagesAndLinks(segment)
    if (sendParts) {
      await onSegment(segment, parts)
      messageCount += parts.length
    } else {
      messageCount += parts.length
    }
  }

  for await (const delta of textStream) {
    fullText += delta
    currentSegment += delta

    let separatorIndex = currentSegment.indexOf(PARAGRAPH_SEPARATOR)
    while (separatorIndex !== -1) {
      const segment = currentSegment.slice(0, separatorIndex).trim()
      if (segment) {
        await handleSegment(segment)
      }
      currentSegment = currentSegment.slice(
        separatorIndex + PARAGRAPH_SEPARATOR.length,
      )
      separatorIndex = currentSegment.indexOf(PARAGRAPH_SEPARATOR)
    }
  }

  const tailSegment = currentSegment.trim()
  if (tailSegment) {
    await handleSegment(tailSegment)
  }

  return { messageCount, fullText }
}
