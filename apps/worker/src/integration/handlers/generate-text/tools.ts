import type { ToolSet } from "ai"
import { normalizeError } from "universal-error-normalizer"
import {
  getAIFileTools,
  getAIFunctionTools,
  getMCPServerTools,
} from "../../../lib/ai"
import { logger } from "../../../lib/logger"
import { toolPrefixes } from "../automated-response/constants"

export function parseToolIds(allTools: string[], prefix: string): string[] {
  return allTools
    .filter((value) => value.startsWith(prefix))
    .map((value) => value.replace(`${prefix}:`, ""))
    .filter((id) => Boolean(id))
}

export async function getAIToolset(
  workspaceId: string,
  tools: string[],
): Promise<{ tools: ToolSet; cleanup: () => Promise<void> }> {
  try {
    const fileIds = parseToolIds(tools, toolPrefixes.enum.file)
    const functionIds = parseToolIds(tools, toolPrefixes.enum.fn)
    const mcpIds = parseToolIds(tools, toolPrefixes.enum.mcp)

    const [fileTools, functionTools, mcpResult] = await Promise.all([
      getAIFileTools(workspaceId, fileIds),
      getAIFunctionTools(workspaceId, functionIds),
      getMCPServerTools(workspaceId, mcpIds),
    ])

    const cleanup = async () => {
      await Promise.allSettled(
        mcpResult.clients.map((c) =>
          c.close().catch((error) => {
            const parsedError = normalizeError(error)
            logger.error(
              { error: parsedError },
              "[automated-response] Failed to close MCP client",
            )
          }),
        ),
      )
    }

    return {
      tools: { ...fileTools, ...functionTools, ...mcpResult.tools },
      cleanup,
    }
  } catch (error) {
    const parsedError = normalizeError(error)
    logger.error(
      { error: parsedError, workspaceId },
      "[automated-response] getAIToolset failed",
    )
    return {
      tools: {},
      cleanup: async () => {
        // No-op cleanup
      },
    }
  }
}
