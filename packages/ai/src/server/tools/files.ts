import { aiFileService } from "@chatbotx.io/business"
import { capText, logDiagnostic } from "@chatbotx.io/logger"
import { type ToolSet, tool } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { logger } from "../../logger"
import { type FileSearchConfig, performFileSearch } from "../knowledge-base"
import { DEFAULT_FILE_SEARCH_MAX_RESULTS } from "../retrieval/constants"

export async function getAIFileTools(
  workspaceId: string,
  selectedFileIds: string[],
  options: {
    fileSearchDescription: string
    fileSearchQueryDescription: string
    fileSearchNoResult?: string
    fileSearchFoundPrefix?: (count: number) => string
    similarityThreshold?: number
    maxResults?: number
  },
): Promise<ToolSet> {
  const {
    fileSearchDescription,
    fileSearchQueryDescription,
    fileSearchNoResult = "No relevant information found.",
    fileSearchFoundPrefix = (count: number) =>
      `Found ${count} matching results:`,
    similarityThreshold,
    maxResults = DEFAULT_FILE_SEARCH_MAX_RESULTS,
  } = options
  try {
    const tools: ToolSet = {}

    if (selectedFileIds.length === 0) {
      return tools
    }

    const allFiles = await aiFileService.findManyByIds({
      workspaceId,
      ids: selectedFileIds,
    })

    if (allFiles.length > 0) {
      tools.search_knowledge_base = tool({
        description: fileSearchDescription,
        inputSchema: z.object({
          query: z.string().describe(fileSearchQueryDescription),
        }),
        execute: async ({ query }) => {
          const config: FileSearchConfig = {
            workspaceId,
            selectedFileIds,
            similarityThreshold,
            maxResults,
          }
          const results = await performFileSearch({ query }, config)

          if (results.length === 0) {
            logger.info(
              { workspaceId, queryLength: query.length },
              "[knowledge-base] tool: no results found",
            )
            return fileSearchNoResult
          }

          const formattedResults = results
            .map((item, index) => `${index + 1}. ${item.content}`)
            .join("\n\n")

          const toolOutput = `${fileSearchFoundPrefix(results.length)}\n\n${formattedResults}`

          logger.info(
            {
              workspaceId,
              resultCount: results.length,
              outputLength: toolOutput.length,
              queryLength: query.length,
              chunkIds: results.map((result) => result.id),
              topSimilarity: results[0]?.similarity,
            },
            "[knowledge-base] tool: formatted output sent to AI",
          )
          logDiagnostic(
            logger,
            () => ({
              workspaceId,
              query: capText(query, 500),
              chunkIds: results.map((result) => result.id),
            }),
            "[knowledge-base] tool: query diagnostic",
          )

          return toolOutput
        },
      })
    }

    return tools
  } catch (error) {
    logger.error(
      {
        err: normalizeError(error),
        workspaceId,
      },
      "[ai-package] getAIFileTools failed",
    )
    return {}
  }
}
