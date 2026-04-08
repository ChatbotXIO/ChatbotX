import { createOpenAI } from "@ai-sdk/openai"
import { db, sql } from "@chatbotx.io/database/client"
import type { SecretTextAuthValue } from "@chatbotx.io/sdk"
import { embed } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { logger } from "../../../lib/logger"
import { helpTexts, openaiEmbeddingModels } from "./constants"
import type {
  FileSearchArgs,
  FileSearchConfig,
  SimilaritySearchResult,
} from "./types"

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

  const apiKey = (integrationOpenAI.auth as SecretTextAuthValue).secretText
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
      "[automated-response] Invalid similarity search results",
    )
    return []
  }

  return parsed.data
}

function filterRelevantResults(
  results: SimilaritySearchResult[],
  threshold: number,
): SimilaritySearchResult[] {
  return results.filter((result) => result.distance > threshold)
}

function formatSearchResults(results: SimilaritySearchResult[]): string {
  if (results.length === 0) {
    return helpTexts.fileSearchNoResult
  }

  const formattedResults = results
    .map((item, index) => `${index + 1}. ${item.content}`)
    .join("\n\n")

  return `${helpTexts.fileSearchFoundPrefix(results.length)}\n\n${formattedResults}`
}

export async function performFileSearch(
  args: FileSearchArgs,
  config: FileSearchConfig,
): Promise<string> {
  try {
    const queryEmbedding = await createQueryEmbedding(
      args.query,
      config.workspaceId,
    )
    const searchResults = await searchSimilarEmbeddings(queryEmbedding, config)

    if (searchResults.length === 0) {
      return helpTexts.fileSearchNoResult
    }

    const relevantResults = filterRelevantResults(
      searchResults,
      config.similarityThreshold,
    )

    if (relevantResults.length === 0) {
      return helpTexts.fileSearchNoResult
    }

    const result = formatSearchResults(relevantResults)
    return result
  } catch (error) {
    const parsedError = normalizeError(error)
    logger.error(
      {
        error: parsedError,
        workspaceId: config.workspaceId,
      },
      "[automated-response] performFileSearch failed",
    )
    return `${helpTexts.fileSearchErrorPrefix} ${error instanceof Error ? error.message : helpTexts.unknownError}`
  }
}
