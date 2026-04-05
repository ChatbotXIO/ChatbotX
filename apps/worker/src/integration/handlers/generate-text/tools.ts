import type { ToolSet } from "ai"
import {
  getAIFileTools,
  getAIFunctionTools,
  getMCPServerTools,
} from "../../../lib/ai"
import { toolPrefix } from "../automated-response/constants"

export function parseToolIds(allTools: string[], prefix: string): string[] {
  return allTools
    .filter((value) => value.startsWith(prefix))
    .map((value) => value.replace(prefix, ""))
    .filter((id) => Boolean(id))
}

export async function getAIToolset(
  workspaceId: string,
  tools: string[],
): Promise<ToolSet> {
  try {
    const fileIds = parseToolIds(tools, toolPrefix.file)
    const functionIds = parseToolIds(tools, toolPrefix.fn)
    const mcpIds = parseToolIds(tools, toolPrefix.mcp)

    const [fileTools, functionTools, mcpTools] = await Promise.all([
      getAIFileTools(workspaceId, fileIds),
      getAIFunctionTools(workspaceId, functionIds),
      getMCPServerTools(workspaceId, mcpIds),
    ])

    return { ...fileTools, ...functionTools, ...mcpTools }
  } catch {
    return {}
  }
}
