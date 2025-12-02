import type { ToolSet } from "ai"
import { logger } from "../../../lib/logger"
import { TOOL_PREFIX } from "../automated-response/constants"
import {
  getAIFileTools,
  getAIFunctionTools,
  getMCPServerTools,
  parseSelectedIdsFromTools,
} from "../automated-response/tools"

// Parse tool IDs from step config (wrapper for consistency)
export function parseToolIds(toolIds: string[], prefix: string): string[] {
  return parseSelectedIdsFromTools(toolIds, prefix)
}

// Load AI tools from database based on tool IDs in step config
export async function getToolsFromStepConfig(
  chatbotId: string,
  tools: string[],
): Promise<ToolSet> {
  try {
    const fileIds = parseToolIds(tools, TOOL_PREFIX.file)
    const functionIds = parseToolIds(tools, TOOL_PREFIX.fn)
    const mcpIds = parseToolIds(tools, TOOL_PREFIX.mcp)

    const [fileTools, functionTools, mcpTools] = await Promise.all([
      getAIFileTools(chatbotId, fileIds),
      getAIFunctionTools(chatbotId, functionIds),
      getMCPServerTools(chatbotId, mcpIds),
    ])

    return { ...fileTools, ...functionTools, ...mcpTools }
  } catch (error) {
    logger.error("[ai-generate-text] getToolsFromStepConfig failed", {
      error,
      chatbotId,
    })
    return {}
  }
}
