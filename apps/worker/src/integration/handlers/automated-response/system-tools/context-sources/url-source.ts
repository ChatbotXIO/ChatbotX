import { db, desc, eq, sql } from "@chatbotx.io/database/client"
import {
  aiConversationSourceStatuses,
  aiConversationSourceTypes,
  aiEmbeddingStatuses,
} from "@chatbotx.io/database/partials"
import { aiConversationSourceModel } from "@chatbotx.io/database/schema"
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

const URL_SOURCE_TYPE = aiConversationSourceTypes.enum.url
const DEFAULT_TOP_K = 5
const STALE_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000
const PROCESS_SOURCE_JOB_ID_PREFIX = AIJobAction.processConversationSource
const MAX_SOURCE_KEY_LENGTH = 500

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

const urlMetadataSchema = z.object({ url: z.string() }).passthrough()

function buildUrlSourceKey(url: string): string {
  return `url:${url}`.slice(0, MAX_SOURCE_KEY_LENGTH)
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

function findUrlConversationSource(input: {
  sourceKey: string
  workspaceId: string
}) {
  return db.query.aiConversationSourceModel.findFirst({
    where: {
      workspaceId: input.workspaceId,
      sourceType: URL_SOURCE_TYPE,
      sourceKey: input.sourceKey,
    },
  })
}

async function createUrlConversationSource(input: {
  conversationId: string
  messageId: string
  sourceKey: string
  url: string
  workspaceId: string
}) {
  const source = await db
    .insert(aiConversationSourceModel)
    .values({
      id: createId(),
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      messageId: input.messageId,
      attachmentId: null,
      sourceType: URL_SOURCE_TYPE,
      status: aiConversationSourceStatuses.enum.pending,
      sourceKey: input.sourceKey,
      mimeType: "text/html",
      title: input.url,
      metadata: { url: input.url },
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
    findUrlConversationSource({
      workspaceId: input.workspaceId,
      sourceKey: input.sourceKey,
    })
  )
}

async function resolveUrlSource(
  input: ResolveConversationSourceInput,
): Promise<null | ResolvedConversationSource> {
  if (!input.messageId) {
    logger.warn(
      {
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
      },
      "[url-source] messageId is required to create url source",
    )
    return null
  }

  let source: Awaited<ReturnType<typeof findUrlConversationSource>>

  if (input.sourceHint?.trim()) {
    const url = input.sourceHint.trim()
    const sourceKey = buildUrlSourceKey(url)

    source = await findUrlConversationSource({
      workspaceId: input.workspaceId,
      sourceKey,
    })

    if (!source) {
      source = await createUrlConversationSource({
        conversationId: input.conversationId,
        messageId: input.messageId,
        sourceKey,
        url,
        workspaceId: input.workspaceId,
      })
    }
  } else {
    source = await db.query.aiConversationSourceModel.findFirst({
      where: {
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        sourceType: URL_SOURCE_TYPE,
      },
      orderBy: (table) => [desc(table.createdAt)],
    })
  }

  if (!source) {
    return null
  }

  if (source.status === aiConversationSourceStatuses.enum.error && source.id) {
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
          sourceId: source?.id,
          workspaceId: input.workspaceId,
          conversationId: input.conversationId,
        },
        "[url-source] failed to enqueue source processing",
      )
    })
  }

  return {
    source,
    attachment: undefined,
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

async function retrieveUrlChunks(
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

async function prepareUrlContext(
  input: PrepareConversationContextInput,
): Promise<null | PreparedConversationContext> {
  const resolvedSource = await resolveUrlSource(input)
  if (!resolvedSource) {
    return null
  }

  const snippets = await retrieveUrlChunks({
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

export { urlMetadataSchema }

export const urlContextSourceAdapter: ConversationContextSourceAdapter = {
  sourceType: URL_SOURCE_TYPE,
  resolveSource: resolveUrlSource,
  retrieveRelevantChunks: retrieveUrlChunks,
  prepareContext: prepareUrlContext,
}
