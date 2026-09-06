import { db, sql } from "@chatbotx.io/database/client"
import { aiEmbeddingStatuses } from "@chatbotx.io/database/partials"
import { embed } from "ai"
import { z } from "zod"
import { logger } from "../logger"
import {
  type EmbeddingProvider,
  resolveEmbeddingModel,
} from "./embedding-model"

const REGEX_NUMERIC_ID = /^\d+$/

const distanceSchema = z
  .union([z.number(), z.string()])
  .transform((value, ctx) => {
    const parsed = typeof value === "string" ? Number(value) : value
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({
        code: "custom",
        message: "Invalid distance",
      })
      return z.NEVER
    }
    return parsed
  })

const similaritySearchResultSchema = z.object({
  id: z.string(),
  content: z.string(),
  aiFileId: z.string(),
  distance: distanceSchema,
})

const similaritySearchResultsSchema = z.array(similaritySearchResultSchema)

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

async function createQueryEmbedding(
  query: string,
  workspaceId: string,
): Promise<{ embedding: number[]; provider: EmbeddingProvider }> {
  const resolvedEmbeddingModel = await resolveEmbeddingModel(workspaceId)
  const { embedding } = await embed({
    model: resolvedEmbeddingModel.model,
    value: query,
    providerOptions: {
      google: { outputDimensionality: 1536 },
    },
  })

  return { embedding, provider: resolvedEmbeddingModel.provider }
}

async function searchSimilarEmbeddings(
  queryEmbedding: number[],
  config: FileSearchConfig,
): Promise<SimilaritySearchResult[]> {
  const embeddingLiteral = sql.raw(`'[${queryEmbedding.join(",")}]'::vector`)
  const numericIds = config.selectedFileIds.filter((id) =>
    REGEX_NUMERIC_ID.test(id),
  )
  if (numericIds.length === 0) {
    return []
  }
  const fileIdList = sql.raw(numericIds.join(","))

  const results = await db.execute(sql`
    SELECT
      "id",
      "content",
      "aiFileId",
      1 - ("embedding" <=> ${embeddingLiteral}) as distance
    FROM "AIEmbedding"
    WHERE "workspaceId" = ${config.workspaceId}
      AND "aiFileId" = ANY(ARRAY[${fileIdList}]::bigint[])
      AND "status" = ${aiEmbeddingStatuses.enum.success}::"aiEmbeddingStatus"
      AND "embedding" IS NOT NULL
    ORDER BY "embedding" <=> ${embeddingLiteral}
    LIMIT ${config.maxResults}
  `)

  const parsed = similaritySearchResultsSchema.safeParse(results.rows)
  if (!parsed.success) {
    logger.warn(
      {
        workspaceId: config.workspaceId,
        issues: parsed.error.issues,
      },
      "[ai-package] Invalid similarity search results",
    )
    return []
  }

  return parsed.data
}

export async function performFileSearch(
  args: { query: string },
  config: FileSearchConfig,
): Promise<SimilaritySearchResult[]> {
  const queryEmbedding = await createQueryEmbedding(
    args.query,
    config.workspaceId,
  )
  const searchResults = await searchSimilarEmbeddings(
    queryEmbedding.embedding,
    config,
  )
  const similarityThreshold =
    config.similarityThreshold ??
    embeddingSimilarityThresholds[queryEmbedding.provider]

  return searchResults.filter((result) => result.distance > similarityThreshold)
}
