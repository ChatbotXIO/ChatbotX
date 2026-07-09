import { createHash } from "node:crypto"
import { assertPublicUrl } from "@chatbotx.io/business"
import { aiConversationSourceStatuses } from "@chatbotx.io/database/partials"
import {
  type AiConversationSourceWithAttachment,
  createConversationEmbeddingRepository,
  createConversationSourceRepository,
} from "@chatbotx.io/database/repositories"
import { createId } from "@chatbotx.io/utils"
import {
  AI_FILES_DEFAULT_CHUNK_SIZE,
  AI_FILES_DEFAULT_OVERLAP_SIZE,
  AIJobAction,
  type AIJobProcessConversationSource,
  aiAgentQueue,
} from "@chatbotx.io/worker-config"
import { Readability } from "@mozilla/readability"
import { htmlToText } from "html-to-text"
import { parseHTML } from "linkedom"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { logger } from "../../lib/logger"
import { withTimeout } from "../lib/async-utils"
import { isSupportedDocumentMimeType } from "../lib/mime-utils"
import { extractTextFromFile } from "../lib/text-extractor"

const sourceRepo = createConversationSourceRepository()
const embeddingRepo = createConversationEmbeddingRepository()

const MAX_DOCUMENT_TEXT_CHARS = 200_000
const MAX_DOCUMENT_CHUNKS = 120
const PARSE_TIMEOUT_MS = 30_000
const URL_FETCH_TIMEOUT_MS = 15_000
const MAX_URL_RESPONSE_BYTES = 500_000
const MAX_REDIRECTS = 3

const urlSourceMetadataSchema = z.object({ url: z.string() })

type TextChunk = {
  content: string
  chunkIndex: number
}

function splitTextIntoChunks(
  text: string,
  chunkSize = AI_FILES_DEFAULT_CHUNK_SIZE,
  overlapSize = AI_FILES_DEFAULT_OVERLAP_SIZE,
): TextChunk[] {
  const chunks: TextChunk[] = []
  if (!text || chunkSize <= 0) {
    return chunks
  }

  let start = 0
  let chunkIndex = 0
  while (start < text.length && chunks.length < MAX_DOCUMENT_CHUNKS) {
    const end = Math.min(start + chunkSize, text.length)
    const piece = text.slice(start, end).trim()
    if (piece.length > 0) {
      chunks.push({
        content: piece,
        chunkIndex,
      })
      chunkIndex += 1
    }

    if (end === text.length) {
      break
    }

    start = Math.max(0, end - overlapSize)
  }

  return chunks
}

function extractReadableText(html: string, url?: string): string {
  try {
    const { document } = parseHTML(html, url ?? "")
    const article = new Readability(document as unknown as Document).parse()
    if (article?.textContent && article.textContent.trim().length > 200) {
      return article.textContent.trim()
    }
  } catch {
    // Readability parse failure — fall back to htmlToText
  }
  return htmlToText(html, { wordwrap: false })
}

function summarizeText(text: string): string {
  return text.slice(0, 500).trim()
}

function saveEmbeddingChunks(
  sourceId: string,
  workspaceId: string,
  conversationId: string,
  chunks: TextChunk[],
): Promise<Array<{ id: string }>> {
  return embeddingRepo.replaceForSource({
    sourceId,
    chunks: chunks.map((chunk) => ({
      id: createId(),
      sourceId,
      workspaceId,
      conversationId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
    })),
  })
}

async function enqueueEmbeddingJobs(
  embeddingRows: Array<{ id: string }>,
): Promise<void> {
  if (embeddingRows.length === 0) {
    return
  }

  await aiAgentQueue.addBulk(
    embeddingRows.map((embedding) => ({
      name: AIJobAction.processConversationSourceEmbedding,
      data: {
        type: AIJobAction.processConversationSourceEmbedding,
        data: { conversationEmbeddingId: embedding.id },
      },
    })),
  )
}

type SourceRecord = AiConversationSourceWithAttachment

async function processDocumentSource(source: SourceRecord): Promise<void> {
  if (source.status === aiConversationSourceStatuses.enum.success) {
    return
  }

  if (!(source.attachment && source.attachmentId)) {
    await sourceRepo.update(source.id, {
      status: aiConversationSourceStatuses.enum.error,
      errorMessage: "Attachment not found for document source",
    })
    return
  }

  const attachment = source.attachment

  if (!isSupportedDocumentMimeType(attachment.mimeType)) {
    await sourceRepo.update(source.id, {
      status: aiConversationSourceStatuses.enum.error,
      errorMessage: "Unsupported document mime type",
    })
    return
  }

  await sourceRepo.update(source.id, {
    status: aiConversationSourceStatuses.enum.processing,
    errorMessage: null,
  })

  try {
    const extractedText = await withTimeout(
      extractTextFromFile(attachment.originPath, attachment.mimeType),
      PARSE_TIMEOUT_MS,
    )
    const trimmedText = extractedText.slice(0, MAX_DOCUMENT_TEXT_CHARS).trim()

    if (!trimmedText) {
      await sourceRepo.update(source.id, {
        status: aiConversationSourceStatuses.enum.error,
        errorMessage: "Unable to extract readable text from document",
      })
      return
    }

    const chunks = splitTextIntoChunks(trimmedText)
    const contentHash = createHash("sha256").update(trimmedText).digest("hex")
    const embeddingRows = await saveEmbeddingChunks(
      source.id,
      source.workspaceId,
      source.conversationId,
      chunks,
    )

    await sourceRepo.update(source.id, {
      status: aiConversationSourceStatuses.enum.success,
      contentHash,
      summary: summarizeText(trimmedText),
      metadata: {
        chunkCount: embeddingRows.length,
        maxChunks: MAX_DOCUMENT_CHUNKS,
        maxTextChars: MAX_DOCUMENT_TEXT_CHARS,
      },
      errorMessage: null,
    })

    await enqueueEmbeddingJobs(embeddingRows)
  } catch (error) {
    const normalizedError = normalizeError(error)
    logger.error(
      {
        error: normalizedError,
        sourceId: source.id,
        conversationId: source.conversationId,
        workspaceId: source.workspaceId,
      },
      "[ai-agent] processDocumentSource failed",
    )

    await sourceRepo.update(source.id, {
      status: aiConversationSourceStatuses.enum.error,
      errorMessage:
        normalizedError.message || "Failed to process conversation source",
    })
  }
}

async function fetchSafe(
  url: string,
  signal: AbortSignal,
  redirectsLeft = MAX_REDIRECTS,
): Promise<Response> {
  await assertPublicUrl(url, "URL source")

  const response = await fetch(url, {
    signal,
    redirect: "manual",
    headers: {
      "User-Agent": "ChatbotX-URLContext/1.0",
      Accept: "text/html,text/plain;q=0.9",
    },
  })

  if (response.status >= 300 && response.status < 400) {
    if (redirectsLeft <= 0) {
      throw new Error("Too many redirects")
    }
    const location = response.headers.get("location")
    if (!location) {
      throw new Error("Redirect with no Location header")
    }
    return fetchSafe(new URL(location, url).href, signal, redirectsLeft - 1)
  }

  return response
}

async function fetchHtmlText(url: string): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS)

  try {
    const response = await fetchSafe(url, controller.signal)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const contentType = response.headers.get("content-type") ?? ""
    if (
      !(contentType.includes("text/html") || contentType.includes("text/plain"))
    ) {
      throw new Error(`Unsupported content type: ${contentType}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error("No response body")
    }

    const chunks: Uint8Array[] = []
    let totalBytes = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (value) {
        totalBytes += value.byteLength
        chunks.push(value)
        if (totalBytes >= MAX_URL_RESPONSE_BYTES) {
          await reader.cancel()
          break
        }
      }
    }

    const combined = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
      combined.set(chunk, offset)
      offset += chunk.byteLength
    }

    return extractReadableText(new TextDecoder().decode(combined), url)
  } finally {
    clearTimeout(timeoutId)
  }
}

async function processUrlSource(source: SourceRecord): Promise<void> {
  if (source.status === aiConversationSourceStatuses.enum.success) {
    return
  }

  const parsedMeta = urlSourceMetadataSchema.safeParse(source.metadata)
  if (!parsedMeta.success) {
    await sourceRepo.update(source.id, {
      status: aiConversationSourceStatuses.enum.error,
      errorMessage: "URL missing in source metadata",
    })
    return
  }

  const { url } = parsedMeta.data

  await sourceRepo.update(source.id, {
    status: aiConversationSourceStatuses.enum.processing,
    errorMessage: null,
  })

  try {
    const rawText = await withTimeout(fetchHtmlText(url), URL_FETCH_TIMEOUT_MS)
    const trimmedText = rawText.slice(0, MAX_DOCUMENT_TEXT_CHARS).trim()

    if (!trimmedText) {
      await sourceRepo.update(source.id, {
        status: aiConversationSourceStatuses.enum.error,
        errorMessage: "Unable to extract readable text from URL",
      })
      return
    }

    const chunks = splitTextIntoChunks(trimmedText)
    const contentHash = createHash("sha256").update(trimmedText).digest("hex")
    const embeddingRows = await saveEmbeddingChunks(
      source.id,
      source.workspaceId,
      source.conversationId,
      chunks,
    )

    await sourceRepo.update(source.id, {
      status: aiConversationSourceStatuses.enum.success,
      contentHash,
      summary: summarizeText(trimmedText),
      metadata: {
        url,
        chunkCount: embeddingRows.length,
        maxChunks: MAX_DOCUMENT_CHUNKS,
        maxTextChars: MAX_DOCUMENT_TEXT_CHARS,
      },
      errorMessage: null,
    })

    await enqueueEmbeddingJobs(embeddingRows)
  } catch (error) {
    const normalizedError = normalizeError(error)
    logger.error(
      {
        error: normalizedError,
        sourceId: source.id,
        conversationId: source.conversationId,
        workspaceId: source.workspaceId,
        url,
      },
      "[ai-agent] processUrlSource failed",
    )

    await sourceRepo.update(source.id, {
      status: aiConversationSourceStatuses.enum.error,
      errorMessage: normalizedError.message || "Failed to process URL source",
    })
  }
}

export async function processConversationSource(
  data: AIJobProcessConversationSource["data"],
) {
  const source = await sourceRepo.findByIdWithAttachment(data.sourceId)

  if (!source) {
    throw new Error("AI conversation source not found")
  }

  if (source.sourceType === "document") {
    await processDocumentSource(source)
  } else if (source.sourceType === "url") {
    await processUrlSource(source)
  }
}
