import { prisma } from "@aha.chat/database"
import type { AIAgentModel } from "@aha.chat/database/types"
import { jsonSchema, type ToolSet, tool } from "ai"
import { logger } from "../../../lib/logger"
import { JSON_TYPE, TEXT, TOOL_PREFIX } from "./constants"
import { callMCPTool, cleanSchemaForGemini } from "./mcp"
import { performFileSearch } from "./search"

// Precompiled regex
export const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/

type DataField = {
  type?: string
  description?: string
  required?: boolean
}

export function parseSelectedIdsFromTools(
  all: readonly string[],
  prefix: string,
): string[] {
  return all
    .filter((value) => value.startsWith(prefix))
    .map((value) => value.slice(prefix.length))
    .filter((id) => Boolean(id))
}

export async function getAIFileTools(
  chatbotId: string,
  selectedFileIds: string[],
): Promise<ToolSet> {
  try {
    const tools: ToolSet = {}

    if (selectedFileIds.length === 0) {
      return tools
    }

    const allFiles = await prisma.aIFile.findMany({
      where: { chatbotId, id: { in: selectedFileIds } },
    })

    if (allFiles.length > 0) {
      tools.file_search = tool({
        description: TEXT.fileSearchDescription,
        inputSchema: jsonSchema({
          type: JSON_TYPE.object,
          properties: {
            query: {
              type: JSON_TYPE.string,
              description: TEXT.fileSearchQueryDescription,
            },
          },
          required: ["query"],
        } as Parameters<typeof jsonSchema>[0]),
        execute: async (args: { query: string }) => {
          const config = {
            chatbotId,
            selectedFileIds,
            similarityThreshold: 0.7,
            maxResults: 5,
          }
          return await performFileSearch(args, config)
        },
      })
    }

    return tools
  } catch (error) {
    logger.error("[automated-response] getAIFileTools failed", {
      error,
      chatbotId,
    })
    return {}
  }
}

export async function getAIFunctionTools(
  chatbotId: string,
  selectedFunctionIds: string[],
): Promise<ToolSet> {
  try {
    const tools: ToolSet = {}

    if (selectedFunctionIds.length === 0) {
      return tools
    }

    const aiFunctions = await prisma.aIFunction.findMany({
      where: { chatbotId, id: { in: selectedFunctionIds } },
    })

    for (const aiFunction of aiFunctions) {
      const functionName = aiFunction.name
      const functionPurpose = aiFunction.purpose || ""
      const dataCollect =
        (aiFunction.dataCollect as Record<string, unknown>) || {}
      const outputMessage = aiFunction.outputMessage || ""

      const properties: Record<string, unknown> = {}
      const required: string[] = []

      if (dataCollect && typeof dataCollect === JSON_TYPE.object) {
        for (const [key, value] of Object.entries(dataCollect)) {
          if (value && typeof value === JSON_TYPE.object) {
            const v = value as DataField
            const typeName =
              typeof v.type === JSON_TYPE.string ? v.type : JSON_TYPE.string
            properties[key] = {
              type: typeName,
              description:
                typeof v.description === JSON_TYPE.string ? v.description : "",
            }
            if (v.required) {
              required.push(key)
            }
          }
        }
      }

      tools[functionName] = tool({
        description: functionPurpose,
        inputSchema: jsonSchema({
          type: JSON_TYPE.object,
          properties,
          required,
        } as Parameters<typeof jsonSchema>[0]),
        execute: async () => await Promise.resolve(outputMessage),
      })
    }
    return tools
  } catch (error) {
    logger.error("[automated-response] getAIFunctionTools failed", {
      error,
      chatbotId,
    })
    return {}
  }
}

export async function getMCPServerTools(
  chatbotId: string,
  selectedMcpIds: string[],
  mcpAuth?:
    | {
        type: "TOKEN"
        token: string
      }
    | {
        type: "HEADERS"
        headers: Array<{ header: string; value: string }>
      }
    | {
        type: "NONE"
      },
): Promise<ToolSet> {
  try {
    const tools: ToolSet = {}

    if (selectedMcpIds.length === 0) {
      return tools
    }

    const mcpServers = await prisma.aIMCPServer.findMany({
      where: { chatbotId, id: { in: selectedMcpIds } },
    })
    if (mcpServers.length === 0) {
      return tools
    }

    for (const mcpServer of mcpServers) {
      const availableTools = mcpServer.availableTools as Record<
        string,
        { description: string; inputSchema: { jsonSchema: unknown } }
      >
      if (!availableTools || typeof availableTools !== JSON_TYPE.object) {
        continue
      }

      for (const toolName of mcpServer.selectedTools) {
        const toolDef = availableTools[toolName]
        if (!toolDef) {
          continue
        }

        const cleanToolName = toolName.replace(/[^a-zA-Z0-9_-]/g, "_")
        const cleanServerName = mcpServer.name.replace(/[^a-zA-Z0-9_-]/g, "_")
        const uniqueToolName = `${cleanServerName}_${cleanToolName}`

        const toolNamePattern = TOOL_NAME_PATTERN
        if (!toolNamePattern.test(uniqueToolName)) {
          continue
        }

        const cleanedSchema = cleanSchemaForGemini(
          toolDef.inputSchema.jsonSchema,
        )

        // Determine MCP auth type
        let finalMcpAuth:
          | { type: "TOKEN"; token: string }
          | {
              type: "HEADERS"
              headers: Array<{ header: string; value: string }>
            }
          | { type: "NONE" }

        if (mcpAuth) {
          finalMcpAuth = mcpAuth
        } else {
          const auth = mcpServer.auth as {
            type: string
            token?: string
            headers?: Array<{ header: string; value: string }>
          } | null

          if (auth?.type === "TOKEN") {
            finalMcpAuth = { type: "TOKEN", token: auth.token || "" }
          } else if (auth?.type === "HEADERS") {
            finalMcpAuth = { type: "HEADERS", headers: auth.headers || [] }
          } else {
            finalMcpAuth = { type: "NONE" }
          }
        }

        tools[uniqueToolName] = tool({
          description: `${toolDef.description} (from ${mcpServer.name})`,
          inputSchema: jsonSchema(
            cleanedSchema as Parameters<typeof jsonSchema>[0],
          ),
          execute: async (args: Record<string, unknown>) => {
            const result = await callMCPTool(
              mcpServer.url,
              toolName,
              args,
              finalMcpAuth,
            )
            return (
              (result as unknown as { content?: unknown }).content ??
              (await Promise.resolve(result))
            )
          },
        })
      }
    }

    return tools
  } catch (error) {
    logger.error("[automated-response] getMCPServerTools failed", {
      error,
      chatbotId,
    })
    return {}
  }
}

export async function getSelectedTools(aiAgent: AIAgentModel): Promise<{
  tools: ToolSet
  availableTools: {
    fileTools: string[]
    functionTools: string[]
    mcpTools: string[]
  }
}> {
  try {
    const selectedFileIds = parseSelectedIdsFromTools(
      aiAgent.tools,
      TOOL_PREFIX.file,
    )
    const selectedFunctionIds = parseSelectedIdsFromTools(
      aiAgent.tools,
      TOOL_PREFIX.fn,
    )
    const selectedMcpIds = parseSelectedIdsFromTools(
      aiAgent.tools,
      TOOL_PREFIX.mcp,
    )

    const [fileTools, functionTools, mcpTools] = await Promise.all([
      getAIFileTools(aiAgent.chatbotId, selectedFileIds),
      getAIFunctionTools(aiAgent.chatbotId, selectedFunctionIds),
      getMCPServerTools(aiAgent.chatbotId, selectedMcpIds),
    ])

    const allTools = { ...fileTools, ...functionTools, ...mcpTools }
    const availableTools = {
      fileTools: Object.keys(fileTools),
      functionTools: Object.keys(functionTools),
      mcpTools: Object.keys(mcpTools),
    }

    return { tools: allTools, availableTools }
  } catch (error) {
    logger.error("[automated-response] getSelectedTools failed", {
      error,
      chatbotId: aiAgent.chatbotId,
    })
    return {
      tools: {},
      availableTools: { fileTools: [], functionTools: [], mcpTools: [] },
    }
  }
}
