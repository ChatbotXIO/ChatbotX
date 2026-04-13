import { db } from "@chatbotx.io/database/client"
import { type ToolSet, tool } from "ai"
import { z } from "zod"
import { logger } from "../../logger"

export async function getAIFunctionTools(
  workspaceId: string,
  selectedFunctionIds: string[],
): Promise<ToolSet> {
  try {
    const tools: ToolSet = {}

    if (selectedFunctionIds.length === 0) {
      return tools
    }

    const aiFunctions = await db.query.aiFunctionModel.findMany({
      where: {
        workspaceId,
        id: {
          in: selectedFunctionIds,
        },
      },
    })

    for (const aiFunction of aiFunctions) {
      const functionName = aiFunction.name
      const functionPurpose = aiFunction.purpose || ""
      const outputMessage = aiFunction.outputMessage || ""

      tools[functionName] = tool({
        description: functionPurpose,

        inputSchema: z.looseObject({}),
        execute: async (_args) => await Promise.resolve(outputMessage),
      })
    }
    return tools
  } catch (error) {
    logger.error(
      {
        error,
        workspaceId,
      },
      "[ai-package] getAIFunctionTools failed",
    )
    return {}
  }
}
