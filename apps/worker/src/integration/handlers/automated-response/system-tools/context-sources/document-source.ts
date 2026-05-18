import { and, db, desc, eq, inArray, sql } from "@chatbotx.io/database/client"
import {
  aiConversationSourceStatuses,
  aiConversationSourceTypes,
  aiEmbeddingStatuses,
} from "@chatbotx.io/database/partials"
import {
  aiConversationSourceModel,
  attachmentModel,
} from "@chatbotx.io/database/schema"
import type { AttachmentModel } from "@chatbotx.io/database/types"
import { DOCX_MIME_TYPES, PDF_MIME_TYPES } from "@chatbotx.io/sdk"
import { createId } from "@chatbotx.io/utils"
import {
  AIJobAction,
  type AIJobData,
  aiAgentQueue,
} from "@chatbotx.io/worker-config"
import { embed } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { resolveEmbeddingModel } from "../../../../../ai-agent/lib/embedding-model"
import { logger } from "../../../../../lib/logger"
import type {
  ConversationContextSnippet,
  ConversationContextSourceAdapter,
  PrepareConversationContextInput,
  PreparedConversationContext,
  ResolveConversationSourceInput,
  ResolvedConversationSource,
  RetrieveRelevantChunksInput,
} from "./types"

const DOCUMENT_SOURCE_TYPE = aiConversationSourceTypes.enum.document
const SUPPORTED_DOCUMENT_MIME_TYPES_LIST = [
  ...PDF_MIME_TYPES,
  ...DOCX_MIME_TYPES,
] as string[]
const DEFAULT_TOP_K = 5
const STALE_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000
const PROCESS_SOURCE_JOB_ID_PREFIX = AIJobAction.processConversationSource

const nullableFiniteNumberFromDbSchema = z.preprocess((value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}, z.number().finite().nullable())

const nullableChunkIndexFromDbSchema = z.preprocess((value) => {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null
  }

  if (typeof value === "string") {
    const parsed = Number(value)
    return Number.isInteger(parsed) ? parsed : null
  }

  return null
}, z.number().int().nullable())

const embeddingSearchRowSchema = z.object({
  chunkIndex: nullableChunkIndexFromDbSchema,
  content: z.string(),
  similarity: nullableFiniteNumberFromDbSchema,
})

function normalizeHint(value?: string): null | string {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) {
    return null
  }
  return normalized
}

function matchesHint(source: AttachmentModel, hint: string) {
  const haystack = [
    source.name ?? "",
    source.originPath ?? "",
    source.sourceId ?? "",
  ]
    .join(" ")
    .toLowerCase()
  return haystack.includes(hint)
}

function getProcessSourceJobId(source: ResolvedConversationSource["source"]) {
  return `${PROCESS_SOURCE_JOB_ID_PREFIX}:${source.id}:${source.updatedAt.getTime()}`
}

async function enqueueConversationSource(
  source: ResolvedConversationSource["source"],
): Promise<void> {
  const payload: AIJobData = {
    type: AIJobAction.processConversationSource,
    data: {
      sourceId: source.id,
    },
  }

  await aiAgentQueue.add(AIJobAction.processConversationSource, payload, {
    jobId: getProcessSourceJobId(source),
  })
}

function findDocumentConversationSource(input: {
  sourceKey: string
  workspaceId: string
}) {
  return db.query.aiConversationSourceModel.findFirst({
    where: {
      workspaceId: input.workspaceId,
      sourceType: DOCUMENT_SOURCE_TYPE,
      sourceKey: input.sourceKey,
    },
  })
}

async function createDocumentConversationSource(input: {
  attachment: AttachmentModel
  conversationId: string
  sourceKey: string
  workspaceId: string
}) {
  const source = await db
    .insert(aiConversationSourceModel)
    .values({
      id: createId(),
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      messageId: input.attachment.messageId,
      attachmentId: input.attachment.id,
      sourceType: DOCUMENT_SOURCE_TYPE,
      status: aiConversationSourceStatuses.enum.pending,
      sourceKey: input.sourceKey,
      mimeType: input.attachment.mimeType,
      title: input.attachment.name,
    })
    .onConflictDoNothing({
      target: [
        aiConversationSourceModel.workspaceId,
        aiConversationSourceModel.sourceType,
        aiConversationSourceModel.sourceKey,
      ],
    })
    .returning()
    .then((rows) => rows[0])

  return (
    source ??
    findDocumentConversationSource({
      workspaceId: input.workspaceId,
      sourceKey: input.sourceKey,
    })
  )
}

async function resolveDocumentSource(
  input: ResolveConversationSourceInput,
): Promise<null | ResolvedConversationSource> {
  const attachments = await db
    .select()
    .from(attachmentModel)
    .where(
      and(
        eq(attachmentModel.workspaceId, input.workspaceId),
        eq(attachmentModel.conversationId, input.conversationId),
        inArray(attachmentModel.mimeType, SUPPORTED_DOCUMENT_MIME_TYPES_LIST),
      ),
    )
    .orderBy(desc(attachmentModel.createdAt))

  if (attachments.length === 0) {
    return null
  }

  const hint = normalizeHint(input.sourceHint)
  const triggerMessageAttachment = input.messageId
    ? attachments.find((attachment) => attachment.messageId === input.messageId)
    : null
  const selectedAttachment =
    (hint
      ? attachments.find((attachment) => matchesHint(attachment, hint))
      : null) ??
    triggerMessageAttachment ??
    attachments[0]

  if (!selectedAttachment) {
    return null
  }

  const sourceKey = `attachment:${selectedAttachment.id}`
  let source = await findDocumentConversationSource({
    workspaceId: input.workspaceId,
    sourceKey,
  })

  if (!source) {
    source = await createDocumentConversationSource({
      attachment: selectedAttachment,
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
      sourceKey,
    })
  } else if (
    source.status === aiConversationSourceStatuses.enum.error &&
    source.attachmentId
  ) {
    source = await db
      .update(aiConversationSourceModel)
      .set({
        status: aiConversationSourceStatuses.enum.pending,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(aiConversationSourceModel.id, source.id))
      .returning()
      .then((rows) => rows[0] ?? source)
  }

  if (!source) {
    return null
  }

  const isStaleProcessing =
    source.status === aiConversationSourceStatuses.enum.processing &&
    Date.now() - source.updatedAt.getTime() > STALE_PROCESSING_THRESHOLD_MS

  if (
    source.status === aiConversationSourceStatuses.enum.pending ||
    source.status === aiConversationSourceStatuses.enum.error ||
    isStaleProcessing
  ) {
    enqueueConversationSource(source).catch((error: unknown) => {
      const normalizedError = normalizeError(error)
      logger.error(
        {
          error: normalizedError,
          sourceId: source.id,
          workspaceId: input.workspaceId,
          conversationId: input.conversationId,
        },
        "[document-source] failed to enqueue source processing",
      )
    })
  }

  return {
    source,
    attachment: selectedAttachment,
  }
}

function mapEmbeddingSearchRowToSnippet(
  row: unknown,
): ConversationContextSnippet | null {
  const parsedRow = embeddingSearchRowSchema.safeParse(row)
  if (!parsedRow.success) {
    return null
  }

  const content = parsedRow.data.content.trim()
  if (!content) {
    return null
  }

  return {
    chunkIndex: parsedRow.data.chunkIndex,
    content,
    similarity: parsedRow.data.similarity,
    source: "cached_embedding",
  }
}

async function retrieveDocumentChunks(
  input: RetrieveRelevantChunksInput,
): Promise<ConversationContextSnippet[]> {
  const { resolvedSource } = input
  const topK = input.topK ?? DEFAULT_TOP_K

  if (
    resolvedSource.source.status !== aiConversationSourceStatuses.enum.success
  ) {
    return []
  }

  if (!input.query.trim()) {
    const rows = await db.query.aiConversationEmbeddingModel.findMany({
      where: {
        sourceId: resolvedSource.source.id,
        status: aiEmbeddingStatuses.enum.success,
      },
      orderBy: {
        chunkIndex: "asc",
      },
      limit: topK,
    })

    return rows.map((row) => ({
      chunkIndex: row.chunkIndex,
      content: row.content,
      similarity: null,
      source: "cached_embedding",
    }))
  }

  const embeddingModel = await resolveEmbeddingModel(
    resolvedSource.source.workspaceId,
  )

  const { embedding } = await embed({
    model: embeddingModel,
    value: input.query,
  })

  const queryEmbeddingVector = `[${embedding.join(",")}]`

  const result = await db.execute(sql`
    SELECT
      "id",
      "chunkIndex",
      "content",
      1 - ("embedding" <=> ${queryEmbeddingVector}::vector) as similarity
    FROM "AIConversationEmbedding"
    WHERE "sourceId" = ${resolvedSource.source.id}
      AND "status" = ${aiEmbeddingStatuses.enum.success}::"aiConversationEmbeddingStatus"
      AND "embedding" IS NOT NULL
    ORDER BY "embedding" <=> ${queryEmbeddingVector}::vector
    LIMIT ${topK}
  `)

  const snippets: ConversationContextSnippet[] = []
  for (const row of result.rows) {
    const snippet = mapEmbeddingSearchRowToSnippet(row)
    if (snippet) {
      snippets.push(snippet)
    }
  }

  return snippets
}

async function prepareDocumentContext(
  input: PrepareConversationContextInput,
): Promise<null | PreparedConversationContext> {
  const resolvedSource = await resolveDocumentSource(input)
  if (!resolvedSource) {
    return null
  }

  const snippets = await retrieveDocumentChunks({
    resolvedSource,
    query: input.query,
    topK: input.topK,
  })

  return {
    resolvedSource,
    snippets,
    summary: resolvedSource.source.summary,
  }
}

export const documentContextSourceAdapter: ConversationContextSourceAdapter = {
  sourceType: DOCUMENT_SOURCE_TYPE,
  resolveSource: resolveDocumentSource,
  retrieveRelevantChunks: retrieveDocumentChunks,
  prepareContext: prepareDocumentContext,
}
