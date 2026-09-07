import {
  aiConversationSourceStatuses,
  aiConversationSourceTypes,
} from "@chatbotx.io/database/partials"
import {
  createConversationEmbeddingRepository,
  createConversationSourceRepository,
} from "@chatbotx.io/database/repositories"
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

export const urlMetadataSchema = z.object({ url: z.string() }).passthrough()

const sourceRepo = createConversationSourceRepository()
const embeddingRepo = createConversationEmbeddingRepository()

function buildUrlSourceKey(url: string): string {
  return `url:${url}`.slice(0, MAX_SOURCE_KEY_LENGTH)
}

function getProcessSourceJobId(source: ResolvedConversationSource["source"]) {
  return `${PROCESS_SOURCE_JOB_ID_PREFIX}-${source.id}-${source.updatedAt.getTime()}`
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

  if (input.sourceHint?.trim()) {
    const url = input.sourceHint.trim()
    const sourceKey = buildUrlSourceKey(url)

    const existingSource = await sourceRepo.findByKey({
      workspaceId: input.workspaceId,
      sourceType: URL_SOURCE_TYPE,
      sourceKey,
    })

    if (!existingSource) {
      const newSource = await sourceRepo.createOrIgnore({
        id: createId(),
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        messageId: input.messageId,
        attachmentId: null,
        sourceType: URL_SOURCE_TYPE,
        status: aiConversationSourceStatuses.enum.pending,
        sourceKey,
        mimeType: "text/html",
        title: url,
        metadata: { url },
      })

      if (newSource) {
        sourceRepo
          .deleteOlderByConversation({
            workspaceId: input.workspaceId,
            conversationId: input.conversationId,
            sourceType: URL_SOURCE_TYPE,
            exceptSourceKey: sourceKey,
          })
          .catch((error: unknown) => {
            logger.warn(
              {
                error: normalizeError(error),
                workspaceId: input.workspaceId,
                conversationId: input.conversationId,
              },
              "[url-source] failed to delete older url sources",
            )
          })
      }
    }
  }

  const source = await sourceRepo.findLatestByConversation({
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    sourceType: URL_SOURCE_TYPE,
  })

  if (!source) {
    return null
  }

  if (source.status === aiConversationSourceStatuses.enum.error) {
    await sourceRepo.update(source.id, {
      status: aiConversationSourceStatuses.enum.pending,
      errorMessage: null,
    })
  }

  const latestSource = await sourceRepo.findLatestByConversation({
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    sourceType: URL_SOURCE_TYPE,
  })

  if (!latestSource) {
    return null
  }

  const isStaleProcessing =
    latestSource.status === aiConversationSourceStatuses.enum.processing &&
    Date.now() - latestSource.updatedAt.getTime() >
      STALE_PROCESSING_THRESHOLD_MS

  if (
    latestSource.status === aiConversationSourceStatuses.enum.pending ||
    latestSource.status === aiConversationSourceStatuses.enum.error ||
    isStaleProcessing
  ) {
    enqueueConversationSource(latestSource).catch((error: unknown) => {
      const normalizedError = normalizeError(error)
      logger.error(
        {
          error: normalizedError,
          sourceId: latestSource.id,
          workspaceId: input.workspaceId,
          conversationId: input.conversationId,
        },
        "[url-source] failed to enqueue source processing",
      )
    })
  }

  return {
    source: latestSource,
    attachment: undefined,
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
    const rows = await embeddingRepo.findManyBySource({
      sourceId: resolvedSource.source.id,
      limit: topK,
    })

    return rows.map((row) => ({
      chunkIndex: row.chunkIndex,
      content: row.content,
      similarity: null,
      source: "cached_embedding",
    }))
  }

  const { model: embeddingModel } = await resolveEmbeddingModel(
    resolvedSource.source.workspaceId,
  )

  const { embedding } = await embed({
    model: embeddingModel,
    value: input.query,
    providerOptions: {
      google: { outputDimensionality: 1536 },
    },
  })

  const queryEmbeddingVector = `[${embedding.join(",")}]`

  const rows = await embeddingRepo.vectorSearch({
    sourceId: resolvedSource.source.id,
    queryVector: queryEmbeddingVector,
    topK,
  })

  return rows.map((row) => ({
    chunkIndex: row.chunkIndex,
    content: row.content,
    similarity: row.similarity,
    source: "cached_embedding",
  }))
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

export const urlContextSourceAdapter: ConversationContextSourceAdapter = {
  sourceType: URL_SOURCE_TYPE,
  resolveSource: resolveUrlSource,
  retrieveRelevantChunks: retrieveUrlChunks,
  prepareContext: prepareUrlContext,
}
