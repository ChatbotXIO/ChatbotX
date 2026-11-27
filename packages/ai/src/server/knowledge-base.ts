import { createAiFileEmbeddingRepository } from "@chatbotx.io/database/repositories"
import { embed } from "ai"
import { z } from "zod"
import { logger } from "../logger"
import {
  type EmbeddingProvider,
  resolveEmbeddingModel,
} from "./embedding-model"

const REGEX_NUMERIC_ID = /^\d+$/

const similaritySchema = z
  .union([z.number(), z.string()])
  .transform((value, ctx) => {
    const parsed = typeof value === "string" ? Number(value) : value
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({ code: "custom", message: "Invalid similarity" })
      return z.NEVER
    }
    return parsed
  })

const similaritySearchResultSchema = z.object({
  id: z.string(),
  content: z.string(),
  aiFileId: z.string(),
  similarity: similaritySchema,
  // NULL for rows older than the position column.
  chunkIndex: z.number().int().nullable().default(null),
})

export type SimilaritySearchResult = z.infer<
  typeof similaritySearchResultSchema
>

export type FileSearchConfig = {
  workspaceId: string
  selectedFileIds: string[]
  similarityThreshold?: number
  maxResults: number
}

export const embeddingSimilarityThresholds = {
  openai: 0.7,
  gemini: 0.55,
} as const satisfies Record<EmbeddingProvider, number>

async function createQueryEmbedding(query: string, workspaceId: string) {
  const resolvedEmbeddingModel = await resolveEmbeddingModel(workspaceId)
  const { embedding } = await embed({
    model: resolvedEmbeddingModel.model,
    value: query,
    providerOptions: { google: { outputDimensionality: 1536 } },
  })
  return {
    embedding,
    provider: resolvedEmbeddingModel.provider,
    modelId: resolvedEmbeddingModel.modelId,
  }
}

export async function searchKnowledgeChunks(
  args: { query: string },
  config: FileSearchConfig,
): Promise<{
  matches: Array<
    SimilaritySearchResult & { rank: number; passedThreshold: boolean }
  >
  appliedConfig: {
    provider: EmbeddingProvider
    modelId: string
    similarityThreshold: number
    limit: number
  }
  timingsMs: { embed: number; search: number }
}> {
  const embedStartedAt = performance.now()
  const queryEmbedding = await createQueryEmbedding(
    args.query,
    config.workspaceId,
  )
  const embedMs = Math.round(performance.now() - embedStartedAt)
  const numericIds = config.selectedFileIds.filter((id) =>
    REGEX_NUMERIC_ID.test(id),
  )
  const similarityThreshold =
    config.similarityThreshold ??
    embeddingSimilarityThresholds[queryEmbedding.provider]
  const appliedConfig = {
    provider: queryEmbedding.provider,
    modelId: queryEmbedding.modelId,
    similarityThreshold,
    limit: config.maxResults,
  }
  if (numericIds.length === 0) {
    return {
      matches: [],
      appliedConfig,
      timingsMs: { embed: embedMs, search: 0 },
    }
  }

  const searchStartedAt = performance.now()
  const rows = await createAiFileEmbeddingRepository().vectorSearch({
    workspaceId: config.workspaceId,
    fileIds: numericIds,
    queryVector: queryEmbedding.embedding,
    limit: config.maxResults,
  })
  const parsed = z.array(similaritySearchResultSchema).safeParse(rows)
  if (!parsed.success) {
    logger.warn(
      { workspaceId: config.workspaceId, issues: parsed.error.issues },
      "[ai-package] Invalid similarity search results",
    )
  }
  const results = parsed.success ? parsed.data : []
  return {
    matches: results.map((result, index) => ({
      ...result,
      rank: index + 1,
      passedThreshold: result.similarity > similarityThreshold,
    })),
    appliedConfig,
    timingsMs: {
      embed: embedMs,
      search: Math.round(performance.now() - searchStartedAt),
    },
  }
}

export async function performFileSearch(
  args: { query: string },
  config: FileSearchConfig,
): Promise<SimilaritySearchResult[]> {
  const search = await searchKnowledgeChunks(args, config)
  return search.matches
    .filter((result) => result.passedThreshold)
    .map(
      ({ rank: _rank, passedThreshold: _passedThreshold, ...result }) => result,
    )
}
