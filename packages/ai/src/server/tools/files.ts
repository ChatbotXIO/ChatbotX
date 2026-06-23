import { db } from "@chatbotx.io/database/client"
import { type ToolSet, tool } from "ai"
import { z } from "zod"
import { logger } from "../../logger"
import { type FileSearchConfig, performFileSearch } from "../knowledge-base"

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
    similarityThreshold = 0.7,
    maxResults = 5,
  } = options
  try {
    const tools: ToolSet = {}

    if (selectedFileIds.length === 0) {
      return tools
    }

    const allFiles = await db.query.aiFileModel.findMany({
      where: {
        workspaceId,
        id: { in: selectedFileIds },
      },
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
              { workspaceId, query },
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
              query,
              resultCount: results.length,
              outputLength: toolOutput.length,
              output: toolOutput,
            },
            "[knowledge-base] tool: formatted output sent to AI",
          )

          return toolOutput
        },
      })
    }

    return tools
  } catch (error) {
    logger.error(
      {
        error,
        workspaceId,
      },
      "[ai-package] getAIFileTools failed",
    )
    return {}
  }
}
