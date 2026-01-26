import { ChatJobAction, chatQueue } from "@aha.chat/worker-config"
import { SUPPORTED_IMAGE_EXTENSIONS } from "./constants"

// Precompiled regex literals (top-level for performance)
const REGEX_MD_IMAGE = /!\[([^\]]*)\]\(\s*([^)\s\r\n]+)\s*\)/g
const REGEX_MD_LINK = /\[([^\]]+)\]\(\s*([^)\s\r\n]+)\s*\)/g
const REGEX_RAW_URL = /(https?:\/\/[^\s)\]]+(?:\?[^\s)\]]*)?)/g
const REGEX_ONLY_WHITESPACE = /^\s*$/
const REGEX_ONLY_EMOJI = /^[\u{1F300}-\u{1F9FF}]+$/u
const REGEX_STARS_OR_DASHES = /^[-*]\s*/u

function isImageUrl(url: string): boolean {
  const s = url.trim().toLowerCase()
  if (!(s.startsWith("http://") || s.startsWith("https://"))) {
    return false
  }
  try {
    const u = new URL(s)
    const p = u.pathname.toLowerCase()
    return SUPPORTED_IMAGE_EXTENSIONS.some((ext) => p.endsWith(ext))
  } catch {
    return false
  }
}

export function processTextForImagesAndLinks(text: string): string[] {
  const parts: string[] = []
  const seenUrls = new Set<string>()

  const cleanText = (t: string): string => {
    let s = String(t ?? "")
    s = s.replace(REGEX_STARS_OR_DASHES, "")
    s = s.trim()
    return s
  }

  const mdImage = new RegExp(REGEX_MD_IMAGE.source, REGEX_MD_IMAGE.flags)
  const mdLink = new RegExp(REGEX_MD_LINK.source, REGEX_MD_LINK.flags)
  const rawUrl = new RegExp(REGEX_RAW_URL.source, REGEX_RAW_URL.flags)

  let cursor = 0
  while (cursor < text.length) {
    mdImage.lastIndex = cursor
    mdLink.lastIndex = cursor
    rawUrl.lastIndex = cursor
    const m0 = mdImage.exec(text)
    const m1 = mdLink.exec(text)
    const m2 = rawUrl.exec(text)

    const idx0 = m0 ? m0.index : Number.POSITIVE_INFINITY
    const idx1 = m1 ? m1.index : Number.POSITIVE_INFINITY
    const idx2 = m2 ? m2.index : Number.POSITIVE_INFINITY

    const minIdx = Math.min(idx0, idx1, idx2)

    if (minIdx === Number.POSITIVE_INFINITY) {
      const tail = cleanText(text.slice(cursor))
      if (tail) {
        parts.push(tail)
      }
      break
    }

    if (minIdx > cursor) {
      const before = cleanText(text.slice(cursor, minIdx))
      if (before) {
        parts.push(before)
      }
    }

    if (idx0 === minIdx) {
      // Markdown image: ![alt](url)
      const url = (m0?.[2] || "").trim()
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url)
        parts.push(url)
      }
      cursor = idx0 + (m0?.[0].length ?? 0)
    } else if (idx1 === minIdx) {
      // Markdown link: [text](url)
      const url = (m1?.[2] || "").trim()
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url)
        parts.push(url)
      }
      cursor = idx1 + (m1?.[0].length ?? 0)
    } else {
      // Raw URL
      const url = (m2?.[1] || "").trim()
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url)
        parts.push(url)
      }
      cursor = idx2 + (m2?.[0].length ?? 0)
    }
  }

  const filtered = parts.filter((p) => {
    const t = p.trim()
    if (!t) {
      return false
    }
    if (REGEX_ONLY_WHITESPACE.test(t)) {
      return false
    }
    if (REGEX_ONLY_EMOJI.test(t)) {
      return false
    }
    return true
  })

  return filtered
}

export async function sendMessageWithRender(
  conversationId: string,
  message: string,
): Promise<void> {
  const trimmed = message.trim()
  if (isImageUrl(trimmed)) {
    await chatQueue.add(ChatJobAction.sendChatMessage, {
      type: ChatJobAction.sendChatMessage,
      data: {
        conversationId,
        url: trimmed,
      },
    })
    return
  }

  await chatQueue.add(ChatJobAction.sendChatMessage, {
    type: ChatJobAction.sendChatMessage,
    data: {
      conversationId,
      text: trimmed,
    },
  })
}

export async function sendProcessedTextParts(
  conversationId: string,
  text: string,
): Promise<number> {
  let count = 0
  const parts = processTextForImagesAndLinks(text)
  for (const part of parts) {
    const trimmedPart = part.trim()
    if (
      trimmedPart &&
      trimmedPart.length > 0 &&
      !REGEX_ONLY_WHITESPACE.test(trimmedPart)
    ) {
      count += 1
      await sendMessageWithRender(conversationId, trimmedPart)
    }
  }
  return count
}

export async function processStreamingText(
  textStream: AsyncIterable<string>,
  conversationId: string,
  options?: { sendParts?: boolean },
): Promise<{ messageCount: number; fullText: string }> {
  let fullText = ""
  let messageCount = 0
  const sendParts = options?.sendParts !== false
  let currentSegment = ""

  for await (const delta of textStream) {
    fullText += delta
    currentSegment += delta

    if (currentSegment.includes("\n\n")) {
      const segments = currentSegment.split("\n\n")

      for (let i = 0; i < segments.length - 1; i++) {
        const segment = segments[i].trim()
        if (!segment) {
          continue
        }
        const processedParts = processTextForImagesAndLinks(segment)

        for (const part of processedParts) {
          const trimmedPart = part.trim()
          if (
            trimmedPart &&
            trimmedPart.length > 0 &&
            !REGEX_ONLY_WHITESPACE.test(trimmedPart)
          ) {
            messageCount += 1
            if (sendParts) {
              await sendMessageWithRender(conversationId, trimmedPart)
            }
          }
        }
      }

      currentSegment = segments.at(-1) || ""
    }
  }

  if (currentSegment.trim()) {
    const processedParts = processTextForImagesAndLinks(currentSegment.trim())
    for (const part of processedParts) {
      const trimmedPart = part.trim()
      if (
        trimmedPart &&
        trimmedPart.length > 0 &&
        !REGEX_ONLY_WHITESPACE.test(trimmedPart)
      ) {
        messageCount += 1
        if (sendParts) {
          await sendMessageWithRender(conversationId, trimmedPart)
        }
      }
    }
  }

  return { messageCount, fullText }
}
