import type { ToolSet } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { logger } from "../logger"
import type { JsonValue } from "../schemas"
import {
  getAIFileTools,
  getAIFunctionTools,
  getAISystemTools,
  getMCPServerTools,
  type McpClientConstructor,
  type McpClientLike,
  type SystemFunctionContext,
  type SystemToolExecutors,
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
  systemFunctionContextGetter?: () => Promise<SystemFunctionContext | null>
  systemToolExecutors?: SystemToolExecutors
  toolPrefixes: {
    file: string
    fn: string
    mcp: string
    sys: string
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
    const systemIds = parseToolIds(tools, toolPrefixes.sys)

    const [fileTools, functionTools, systemTools, mcpResult] =
      await Promise.all([
        fileSearch && fileIds.length > 0
          ? getAIFileTools(workspaceId, fileIds, fileSearch)
          : Promise.resolve({}),
        getAIFunctionTools(workspaceId, functionIds),
        Promise.resolve(
          getAISystemTools({
            selectedSystemIds: systemIds,
            systemFunctionContextGetter: options.systemFunctionContextGetter,
            systemToolExecutors: options.systemToolExecutors,
          }),
        ),
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
      tools: {
        ...fileTools,
        ...functionTools,
        ...systemTools,
        ...mcpResult.tools,
      },
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
