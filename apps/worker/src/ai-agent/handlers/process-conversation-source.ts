import { createHash } from "node:crypto"
import { db, eq } from "@chatbotx.io/database/client"
import {
  aiConversationSourceStatuses,
  aiEmbeddingStatuses,
} from "@chatbotx.io/database/partials"
import {
  aiConversationEmbeddingModel,
  aiConversationSourceModel,
} from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import {
  AI_FILES_DEFAULT_CHUNK_SIZE,
  AI_FILES_DEFAULT_OVERLAP_SIZE,
  AIJobAction,
  type AIJobProcessConversationSource,
  aiAgentQueue,
} from "@chatbotx.io/worker-config"
import { htmlToText } from "html-to-text"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { logger } from "../../lib/logger"
import { withTimeout } from "../lib/async-utils"
import { isSupportedDocumentMimeType } from "../lib/mime-utils"
import { extractTextFromFile } from "../lib/text-extractor"

const MAX_DOCUMENT_TEXT_CHARS = 200_000
const MAX_DOCUMENT_CHUNKS = 120
const PARSE_TIMEOUT_MS = 30_000
const URL_FETCH_TIMEOUT_MS = 15_000
const MAX_URL_RESPONSE_BYTES = 500_000

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

function summarizeText(text: string): string {
  return text.slice(0, 500).trim()
}

async function saveEmbeddingChunks(
  sourceId: string,
  workspaceId: string,
  conversationId: string,
  chunks: TextChunk[],
): Promise<Array<{ id: string }>> {
  return await db.transaction(async (tx) => {
    await tx
      .delete(aiConversationEmbeddingModel)
      .where(eq(aiConversationEmbeddingModel.sourceId, sourceId))

    if (chunks.length === 0) {
      return []
    }

    return tx
      .insert(aiConversationEmbeddingModel)
      .values(
        chunks.map((chunk) => ({
          id: createId(),
          sourceId,
          workspaceId,
          conversationId,
          chunkIndex: chunk.chunkIndex,
          content: chunk.content,
          status: aiEmbeddingStatuses.enum.pending,
        })),
      )
      .returning({ id: aiConversationEmbeddingModel.id })
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

type SourceRecord = NonNullable<
  Awaited<
    ReturnType<
      typeof db.query.aiConversationSourceModel.findFirst<{
        with: { attachment: true }
      }>
    >
  >
>

async function processDocumentSource(source: SourceRecord): Promise<void> {
  if (source.status === aiConversationSourceStatuses.enum.success) {
    return
  }

  if (!(source.attachment && source.attachmentId)) {
    await db
      .update(aiConversationSourceModel)
      .set({
        status: aiConversationSourceStatuses.enum.error,
        errorMessage: "Attachment not found for document source",
        updatedAt: new Date(),
      })
      .where(eq(aiConversationSourceModel.id, source.id))
    return
  }

  const attachment = source.attachment

  if (!isSupportedDocumentMimeType(attachment.mimeType)) {
    await db
      .update(aiConversationSourceModel)
      .set({
        status: aiConversationSourceStatuses.enum.error,
        errorMessage: "Unsupported document mime type",
        updatedAt: new Date(),
      })
      .where(eq(aiConversationSourceModel.id, source.id))
    return
  }

  await db
    .update(aiConversationSourceModel)
    .set({
      status: aiConversationSourceStatuses.enum.processing,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(aiConversationSourceModel.id, source.id))

  try {
    const extractedText = await withTimeout(
      extractTextFromFile(attachment.originPath, attachment.mimeType),
      PARSE_TIMEOUT_MS,
    )
    const trimmedText = extractedText.slice(0, MAX_DOCUMENT_TEXT_CHARS).trim()

    if (!trimmedText) {
      await db
        .update(aiConversationSourceModel)
        .set({
          status: aiConversationSourceStatuses.enum.error,
          errorMessage: "Unable to extract readable text from document",
          updatedAt: new Date(),
        })
        .where(eq(aiConversationSourceModel.id, source.id))
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

    await db
      .update(aiConversationSourceModel)
      .set({
        status: aiConversationSourceStatuses.enum.success,
        contentHash,
        summary: summarizeText(trimmedText),
        metadata: {
          chunkCount: embeddingRows.length,
          maxChunks: MAX_DOCUMENT_CHUNKS,
          maxTextChars: MAX_DOCUMENT_TEXT_CHARS,
        },
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(aiConversationSourceModel.id, source.id))

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

    await db
      .update(aiConversationSourceModel)
      .set({
        status: aiConversationSourceStatuses.enum.error,
        errorMessage:
          normalizedError.message || "Failed to process conversation source",
        updatedAt: new Date(),
      })
      .where(eq(aiConversationSourceModel.id, source.id))
  }
}

async function fetchHtmlText(url: string): Promise<string> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "ChatbotX-URLContext/1.0",
        Accept: "text/html,text/plain;q=0.9",
      },
    })

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

    return htmlToText(new TextDecoder().decode(combined), { wordwrap: false })
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
    await db
      .update(aiConversationSourceModel)
      .set({
        status: aiConversationSourceStatuses.enum.error,
        errorMessage: "URL missing in source metadata",
        updatedAt: new Date(),
      })
      .where(eq(aiConversationSourceModel.id, source.id))
    return
  }

  const { url } = parsedMeta.data

  await db
    .update(aiConversationSourceModel)
    .set({
      status: aiConversationSourceStatuses.enum.processing,
      errorMessage: null,
      updatedAt: new Date(),
    })
    .where(eq(aiConversationSourceModel.id, source.id))

  try {
    const rawText = await withTimeout(fetchHtmlText(url), URL_FETCH_TIMEOUT_MS)
    const trimmedText = rawText.slice(0, MAX_DOCUMENT_TEXT_CHARS).trim()

    if (!trimmedText) {
      await db
        .update(aiConversationSourceModel)
        .set({
          status: aiConversationSourceStatuses.enum.error,
          errorMessage: "Unable to extract readable text from URL",
          updatedAt: new Date(),
        })
        .where(eq(aiConversationSourceModel.id, source.id))
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

    await db
      .update(aiConversationSourceModel)
      .set({
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
        updatedAt: new Date(),
      })
      .where(eq(aiConversationSourceModel.id, source.id))

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

    await db
      .update(aiConversationSourceModel)
      .set({
        status: aiConversationSourceStatuses.enum.error,
        errorMessage: normalizedError.message || "Failed to process URL source",
        updatedAt: new Date(),
      })
      .where(eq(aiConversationSourceModel.id, source.id))
  }
}

export async function processConversationSource(
  data: AIJobProcessConversationSource["data"],
) {
  const source = await db.query.aiConversationSourceModel.findFirst({
    where: {
      id: data.sourceId,
    },
    with: {
      attachment: true,
    },
  })

  if (!source) {
    throw new Error("AI conversation source not found")
  }

  if (source.sourceType === "document") {
    await processDocumentSource(source)
  } else if (source.sourceType === "url") {
    await processUrlSource(source)
  }
}
