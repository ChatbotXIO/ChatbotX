import { prisma } from "@aha.chat/database"
import { FileType } from "@aha.chat/database/types"
import { uploader } from "@aha.chat/filesystem"
import { StepType } from "@aha.chat/flow-config"
import { ChatJobAction, chatQueue } from "@aha.chat/worker-config"
import { createId } from "@paralleldrive/cuid2"
import imageSize from "image-size"
import { logger } from "../../../lib/logger"
import { SUPPORTED_IMAGE_EXTENSIONS } from "./constants"

// Precompiled regex literals (top-level for performance)
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

export async function downloadAndUploadImage(
  imageUrl: string,
  conversationId: string,
): Promise<boolean> {
  try {
    const res = await fetch(imageUrl, { redirect: "follow" as const })
    if (!res.ok) {
      throw new Error(`Failed to download image: ${res.status}`)
    }

    const contentType =
      res.headers.get("content-type") || "application/octet-stream"
    const arrayBuf = await res.arrayBuffer()
    const buffer = Buffer.from(arrayBuf)

    // Detect filename from URL if possible
    let detectedName: string | null = null
    try {
      const u = new URL(imageUrl)
      const last = u.pathname.split("/").pop() ?? ""
      detectedName = last ? decodeURIComponent(last) : null
    } catch {
      detectedName = null
    }

    // Detect image dimensions
    let detectedWidth: number | undefined
    let detectedHeight: number | undefined
    if (contentType.startsWith("image/")) {
      const dims = imageSize(buffer)
      detectedWidth = dims.width
      detectedHeight = dims.height
    }

    const conversation = await prisma.conversation.findFirstOrThrow({
      where: { id: conversationId },
      select: { chatbotId: true },
    })

    const path = `public/chatbots/${conversation.chatbotId}/conversations/${conversationId}/${createId()}`
    await uploader.putObject(path, buffer, {
      ACL: "public-read",
      ContentType: contentType,
      ContentLength: buffer.length,
    })

    await chatQueue.add(ChatJobAction.sendFlowMessage, {
      type: ChatJobAction.sendFlowMessage,
      data: {
        conversationId,
        flowVersionId: "",
        step: {
          id: createId(),
          stepType: StepType.sendImage,
          mode: "file",
          url: path,
          buttons: [],
          attachment: {
            originPath: path,
            name: detectedName,
            mimeType: contentType,
            size: buffer.length,
            width: detectedWidth,
            height: detectedHeight,
            fileType: FileType.image,
          },
        },
      },
    })

    return true
  } catch (error) {
    logger.error("[automated-response] downloadAndUploadImage failed", {
      error,
      imageUrl,
      conversationId,
    })
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

  const mdLink = new RegExp(REGEX_MD_LINK.source, REGEX_MD_LINK.flags)
  const rawUrl = new RegExp(REGEX_RAW_URL.source, REGEX_RAW_URL.flags)

  let cursor = 0
  while (cursor < text.length) {
    mdLink.lastIndex = cursor
    rawUrl.lastIndex = cursor
    const m1 = mdLink.exec(text)
    const m2 = rawUrl.exec(text)

    const idx1 = m1 ? m1.index : Number.POSITIVE_INFINITY
    const idx2 = m2 ? m2.index : Number.POSITIVE_INFINITY

    if (
      idx1 === Number.POSITIVE_INFINITY &&
      idx2 === Number.POSITIVE_INFINITY
    ) {
      const tail = cleanText(text.slice(cursor))
      if (tail) {
        parts.push(tail)
      }
      break
    }

    if (idx1 <= idx2) {
      if (idx1 > cursor) {
        const before = cleanText(text.slice(cursor, idx1))
        if (before) {
          parts.push(before)
        }
      }
      const url = (m1?.[2] || "").trim()
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url)
        parts.push(url)
      }
      cursor = idx1 + (m1?.[0].length ?? 0)
    } else {
      if (idx2 > cursor) {
        const before = cleanText(text.slice(cursor, idx2))
        if (before) {
          parts.push(before)
        }
      }
      const url = (m2?.[1] || "").trim()
      if (url && !seenUrls.has(url)) {
        seenUrls.add(url)
        parts.push(url)
      }
      cursor = idx2 + (m2?.[0].length ?? 0)
    }
  }

  return parts.filter((p) => {
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
}

export async function sendMessageWithRender(
  conversationId: string,
  message: string,
): Promise<void> {
  const trimmed = message.trim()
  if (isImageUrl(trimmed)) {
    const success = await downloadAndUploadImage(trimmed, conversationId)
    if (success) {
      return
    }
  }

  await chatQueue.add(ChatJobAction.sendFlowMessage, {
    type: ChatJobAction.sendFlowMessage,
    data: {
      conversationId,
      flowVersionId: "",
      step: {
        id: createId(),
        message,
        stepType: StepType.sendText,
        buttons: [],
      },
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
