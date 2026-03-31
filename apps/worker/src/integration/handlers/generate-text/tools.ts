import type { ToolSet } from "ai"
import {
  getAIFileTools,
  getAIFunctionTools,
  getMCPServerTools,
} from "../../../lib/ai"
import { toolPrefix } from "../automated-response/constants"

export function parseToolIds(allTools: string[], prefix: string): bigint[] {
  return allTools
    .filter((value) => value.startsWith(prefix))
    .map((value) => BigInt(value.replace(prefix, "")))
    .filter((id) => Boolean(id))
}

export async function getAIToolset(
  chatbotId: bigint,
  tools: string[],
): Promise<ToolSet> {
  try {
    const fileIds = parseToolIds(tools, toolPrefix.file)
    const functionIds = parseToolIds(tools, toolPrefix.fn)
    const mcpIds = parseToolIds(tools, toolPrefix.mcp)

    const [fileTools, functionTools, mcpTools] = await Promise.all([
      getAIFileTools(chatbotId, fileIds),
      getAIFunctionTools(chatbotId, functionIds),
      getMCPServerTools(chatbotId, mcpIds),
    ])

    return { ...fileTools, ...functionTools, ...mcpTools }
  } catch {
    return {}
  }
}
