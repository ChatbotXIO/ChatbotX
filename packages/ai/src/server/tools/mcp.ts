import { db } from "@chatbotx.io/database/client"
import {
  type AIMcpServerAuth,
  aiMcpServerAuth,
} from "@chatbotx.io/database/partials"
import { jsonSchema, type ToolSet, tool } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { logger } from "../../logger"
import {
  type JsonObject,
  type JsonValue,
  type MCPTool,
  mcpTextContentSchema,
} from "../../schemas/mcp"

const toolNamePattern = /^[a-zA-Z0-9_-]+$/

export type JsonPrimitive = string | number | boolean | null

export type McpCallToolResult = {
  isError: boolean
  content: JsonValue
}

export type McpClientLike = {
  listTools: () => Promise<MCPTool[]>
  callTool: (toolName: string, args: JsonObject) => Promise<McpCallToolResult>
}

export type McpClientConstructor = new (params: {
  url: string
  auth: AIMcpServerAuth
  name: string
}) => McpClientLike

const isMcpTextContent = (
  value: JsonValue,
): value is z.infer<typeof mcpTextContentSchema> =>
  mcpTextContentSchema.safeParse(value).success

export async function getMCPServerTools(
  workspaceId: string,
  selectedMcpIds: string[],
  options: {
    McpClient: McpClientConstructor
    normalizeMcpContent: (content: JsonValue) => JsonValue
  },
): Promise<{ tools: ToolSet; clients: McpClientLike[] }> {
  const { McpClient, normalizeMcpContent } = options
  try {
    const tools: ToolSet = {}
    const clients: McpClientLike[] = []

    if (selectedMcpIds.length === 0) {
      return { tools, clients }
    }

    const mcpServers = await db.query.aiMCPServerModel.findMany({
      where: {
        workspaceId,
        id: { in: selectedMcpIds },
      },
    })
    if (mcpServers.length === 0) {
      return { tools, clients }
    }

    const results = await Promise.allSettled(
      mcpServers.map(async (mcpServer) => {
        const auth = aiMcpServerAuth.parse(mcpServer.auth)
        const client = new McpClient({
          url: mcpServer.url,
          auth,
          name: mcpServer.name,
        })

        const serverToolList = await client.listTools()
        const selectedToolNames = new Set(mcpServer.selectedTools)
        const cleanServerName = mcpServer.name.replace(/[^a-zA-Z0-9_-]/g, "_")
        const filteredTools: ToolSet = {}

        for (const toolDef of serverToolList) {
          if (!selectedToolNames.has(toolDef.name)) {
            continue
          }

          const cleanToolName = toolDef.name.replace(/[^a-zA-Z0-9_-]/g, "_")
          const uniqueToolName = `${cleanServerName}_${cleanToolName}`
          if (!toolNamePattern.test(uniqueToolName)) {
            continue
          }

          const originalToolName = toolDef.name

          filteredTools[uniqueToolName] = tool({
            description: toolDef.description ?? "",
            inputSchema: toolDef.inputSchema
              ? jsonSchema(toolDef.inputSchema)
              : z.looseObject({}),
            execute: async (args) => {
              const result = await client.callTool(
                originalToolName,
                args as JsonObject,
              )
              if (result.isError) {
                const errorContent = result.content
                let errorMessage = "MCP tool returned an error"
                if (typeof errorContent === "string") {
                  errorMessage = errorContent
                } else if (
                  Array.isArray(errorContent) &&
                  isMcpTextContent(errorContent[0])
                ) {
                  errorMessage = errorContent[0].text
                }
                throw new Error(errorMessage)
              }

              return normalizeMcpContent(result.content)
            },
          })
        }

        return { tools: filteredTools, client }
      }),
    )

    for (const result of results) {
      if (result.status === "fulfilled") {
        Object.assign(tools, result.value.tools)
        clients.push(result.value.client)
      } else {
        const normalized = normalizeError(result.reason)
        logger.error(
          { error: normalized, workspaceId },
          "[ai-package] Failed to load MCP server tools",
        )
      }
    }

    return { tools, clients }
  } catch (error) {
    const normalized = normalizeError(error)
    logger.error(
      { error: normalized, workspaceId },
      "[ai-package] getMCPServerTools failed",
    )
    return { tools: {}, clients: [] }
  }
}
