import { createOpenAI } from "@ai-sdk/openai"
import { db, sql } from "@chatbotx.io/database/client"
import { secretTextAuthSchema } from "@chatbotx.io/sdk"
import { embed } from "ai"
import { z } from "zod"
import { logger } from "../logger"
import { openaiEmbeddingModels } from "../models"

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
  similarityThreshold: number
  maxResults: number
}

async function getOpenAIIntegration(workspaceId: string) {
  const integrationOpenAI = await db.query.integrationOpenaiModel.findFirst({
    where: {
      workspaceId,
      autoReply: true,
    },
  })

  if (!integrationOpenAI) {
    throw new Error("OpenAI integration not found")
  }

  return integrationOpenAI
}

async function createQueryEmbedding(
  query: string,
  workspaceId: string,
): Promise<number[]> {
  const integrationOpenAI = await getOpenAIIntegration(workspaceId)

  const authParsed = secretTextAuthSchema.safeParse(integrationOpenAI.auth)
  if (!authParsed.success) {
    throw new Error("Invalid OpenAI integration auth configuration")
  }

  const apiKey = authParsed.data.secretText
  if (!apiKey) {
    throw new Error("Missing OpenAI API key")
  }

  const openai = createOpenAI({
    apiKey,
  })

  const embeddingModel = openai.embedding(
    openaiEmbeddingModels.enum["text-embedding-ada-002"],
  )
  const { embedding } = await embed({
    model: embeddingModel,
    value: query,
  })

  return embedding
}

async function searchSimilarEmbeddings(
  queryEmbedding: number[],
  config: FileSearchConfig,
): Promise<SimilaritySearchResult[]> {
  const embeddingString = `[${queryEmbedding.join(",")}]`

  const results = await db.execute(sql`
    SELECT
      "id",
      "content",
      "aiFileId",
      1 - ("embedding" <=> ${embeddingString}::vector) as distance
    FROM "AIEmbedding"
    WHERE "workspaceId" = ${config.workspaceId}
      AND "aiFileId" = ANY(${config.selectedFileIds})
    ORDER BY "embedding" <=> ${embeddingString}::vector
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
  const searchResults = await searchSimilarEmbeddings(queryEmbedding, config)

  return searchResults.filter(
    (result) => result.distance > config.similarityThreshold,
  )
}
