import {
  aiConversationSourceStatuses,
  aiConversationSourceTypes,
} from "@chatbotx.io/database/partials"
import {
  createConversationEmbeddingRepository,
  createConversationSourceRepository,
} from "@chatbotx.io/database/repositories"
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
const DOCUMENT_ATTACHMENT_LOOKUP_LIMIT = 50
const STALE_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000
const PROCESS_SOURCE_JOB_ID_PREFIX = AIJobAction.processConversationSource

const sourceRepo = createConversationSourceRepository()
const embeddingRepo = createConversationEmbeddingRepository()

function normalizeHint(value?: string): null | string {
  const normalized = value?.trim().toLowerCase()
  if (!normalized) {
    return null
  }
  return normalized
}

function matchesHint(attachment: AttachmentModel, hint: string) {
  const haystack = [
    attachment.name ?? "",
    attachment.originPath ?? "",
    attachment.sourceId ?? "",
  ]
    .join(" ")
    .toLowerCase()
  return haystack.includes(hint)
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

async function resolveDocumentSource(
  input: ResolveConversationSourceInput,
): Promise<null | ResolvedConversationSource> {
  const attachments = await sourceRepo.findDocumentAttachments({
    workspaceId: input.workspaceId,
    conversationId: input.conversationId,
    supportedMimeTypes: SUPPORTED_DOCUMENT_MIME_TYPES_LIST,
    limit: DOCUMENT_ATTACHMENT_LOOKUP_LIMIT,
  })

  if (attachments.length === 0) {
    return null
  }

  const hint = normalizeHint(input.sourceHint)
  const triggerMessageAttachment = input.messageId
    ? attachments.find((a) => a.messageId === input.messageId)
    : null
  const selectedAttachment =
    (hint ? attachments.find((a) => matchesHint(a, hint)) : null) ??
    triggerMessageAttachment ??
    attachments[0]

  if (!selectedAttachment) {
    return null
  }

  const sourceKey = `attachment:${selectedAttachment.id}`
  let source = await sourceRepo.findByKey({
    workspaceId: input.workspaceId,
    sourceType: DOCUMENT_SOURCE_TYPE,
    sourceKey,
  })

  if (!source) {
    const newSource = await sourceRepo.createOrIgnore({
      id: createId(),
      workspaceId: input.workspaceId,
      conversationId: input.conversationId,
      messageId: selectedAttachment.messageId,
      attachmentId: selectedAttachment.id,
      sourceType: DOCUMENT_SOURCE_TYPE,
      status: aiConversationSourceStatuses.enum.pending,
      sourceKey,
      mimeType: selectedAttachment.mimeType,
      title: selectedAttachment.name,
    })

    if (newSource) {
      sourceRepo
        .deleteOlderByConversation({
          workspaceId: input.workspaceId,
          conversationId: input.conversationId,
          sourceType: DOCUMENT_SOURCE_TYPE,
          exceptSourceKey: sourceKey,
        })
        .catch((error: unknown) => {
          logger.warn(
            {
              error: normalizeError(error),
              workspaceId: input.workspaceId,
              conversationId: input.conversationId,
            },
            "[document-source] failed to delete older document sources",
          )
        })
    }

    source = newSource
  } else if (
    source.status === aiConversationSourceStatuses.enum.error &&
    source.attachmentId
  ) {
    source =
      (await sourceRepo.update(source.id, {
        status: aiConversationSourceStatuses.enum.pending,
        errorMessage: null,
      })) ?? source
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
