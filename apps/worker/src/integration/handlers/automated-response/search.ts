import { prisma } from "@aha.chat/database"
import { createOpenAI } from "@ai-sdk/openai"
import { embed } from "ai"
import { logger } from "../../../lib/logger"
import { DEFAULT_OPENAI_EMBEDDING_MODEL, TEXT } from "./constants"
import type {
  FileSearchArgs,
  FileSearchConfig,
  SecretTextAuthValue,
  SimilaritySearchResult,
} from "./types"

async function getOpenAIIntegration(chatbotId: string) {
  const integrationOpenAI = await prisma.integrationOpenAI.findFirst({
    where: {
      chatbotId,
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
  chatbotId: string,
): Promise<number[]> {
  const integrationOpenAI = await getOpenAIIntegration(chatbotId)

  const openai = createOpenAI({
    apiKey: (integrationOpenAI.auth as SecretTextAuthValue | null)?.secretText,
  })

  const embeddingModel = openai.embedding(DEFAULT_OPENAI_EMBEDDING_MODEL)
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

  const results = await prisma.$queryRaw<SimilaritySearchResult[]>`
    SELECT
      "id",
      "content",
      "aiFileId",
      1 - ("embedding" <=> ${embeddingString}::vector) as distance
    FROM "AIEmbedding"
    WHERE "chatbotId" = ${config.chatbotId}
      AND "aiFileId" = ANY(${config.selectedFileIds})
    ORDER BY "embedding" <=> ${embeddingString}::vector
    LIMIT ${config.maxResults}
  `

  return results
}

function filterRelevantResults(
  results: SimilaritySearchResult[],
  threshold: number,
): SimilaritySearchResult[] {
  return results.filter((result) => result.distance > threshold)
}

function formatSearchResults(results: SimilaritySearchResult[]): string {
  if (results.length === 0) {
    return TEXT.fileSearchNoResult
  }

  const formattedResults = results
    .map((item, index) => `${index + 1}. ${item.content}`)
    .join("\n\n")

  return `${TEXT.fileSearchFoundPrefix(results.length)}\n\n${formattedResults}`
}

export async function performFileSearch(
  args: FileSearchArgs,
  config: FileSearchConfig,
): Promise<string> {
  try {
    const queryEmbedding = await createQueryEmbedding(
      args.query,
      config.chatbotId,
    )
    const searchResults = await searchSimilarEmbeddings(queryEmbedding, config)

    if (searchResults.length === 0) {
      return TEXT.fileSearchNoResult
    }

    const relevantResults = filterRelevantResults(
      searchResults,
      config.similarityThreshold,
    )

    if (relevantResults.length === 0) {
      return TEXT.fileSearchNoResult
    }

    const result = formatSearchResults(relevantResults)
    return result
  } catch (error) {
    logger.error("[automated-response] performFileSearch failed", {
      error,
      chatbotId: config.chatbotId,
    })
    return `${TEXT.fileSearchErrorPrefix} ${error instanceof Error ? error.message : "Unknown error"}`
  }
}
