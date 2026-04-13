import type { ToolSet } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../logger"
import type { JsonValue } from "../utils"
import {
  getAIFileTools,
  getAIFunctionTools,
  getMCPServerTools,
  type McpClientConstructor,
  type McpClientLike,
} from "./tools"

export interface ToolsetOptions {
  fileSearch?: {
    fileSearchDescription: string
    fileSearchQueryDescription: string
    fileSearchNoResult?: string
    fileSearchFoundPrefix?: (count: number) => string
    similarityThreshold?: number
    maxResults?: number
  }
  mcp?: {
    McpClient: McpClientConstructor
    normalizeMcpContent: (content: JsonValue) => JsonValue
  }
  toolPrefixes: {
    file: string
    fn: string
    mcp: string
  }
  tools: string[]
  workspaceId: string
}

export function parseToolIds(allTools: string[], prefix: string): string[] {
  return allTools
    .filter((value) => value.startsWith(prefix))
    .map((value) => value.replace(`${prefix}:`, ""))
    .filter((id) => Boolean(id))
}

export async function getAIToolset(
  options: ToolsetOptions,
): Promise<{ tools: ToolSet; cleanup: () => Promise<void> }> {
  const { workspaceId, tools, toolPrefixes, fileSearch, mcp } = options
  try {
    const fileIds = parseToolIds(tools, toolPrefixes.file)
    const functionIds = parseToolIds(tools, toolPrefixes.fn)
    const mcpIds = parseToolIds(tools, toolPrefixes.mcp)

    const [fileTools, functionTools, mcpResult] = await Promise.all([
      fileSearch && fileIds.length > 0
        ? getAIFileTools(workspaceId, fileIds, fileSearch)
        : Promise.resolve({}),
      getAIFunctionTools(workspaceId, functionIds),
      mcp && mcpIds.length > 0
        ? getMCPServerTools(workspaceId, mcpIds, mcp)
        : Promise.resolve({ tools: {}, clients: [] }),
    ])

    const cleanup = async () => {
      if (mcpResult.clients && mcpResult.clients.length > 0) {
        await Promise.allSettled(
          (
            mcpResult.clients as (McpClientLike & {
              close: () => Promise<void>
            })[]
          ).map((c) =>
            c.close?.().catch((error: unknown) => {
              const parsedError = normalizeError(error)
              logger.error(
                { error: parsedError },
                "[ai-package] Failed to close MCP client",
              )
            }),
          ),
        )
      }
    }

    return {
      tools: { ...fileTools, ...functionTools, ...mcpResult.tools },
      cleanup,
    }
  } catch (error) {
    const parsedError = normalizeError(error)
    logger.error(
      { error: parsedError, workspaceId },
      "[ai-package] getAIToolset failed",
    )
    return {
      tools: {},
      cleanup: async () => {
        // No-op cleanup
      },
    }
  }
}
