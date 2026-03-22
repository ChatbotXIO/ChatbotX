import { db, findOrFail } from "@aha.chat/database/client"
import {
  integrationGeminiModel,
  integrationOpenAIModel,
} from "@aha.chat/database/schema"
import type {
  IntegrationGeminiModel,
  IntegrationOpenAIModel,
} from "@aha.chat/database/types"
import { aiProviders } from "@aha.chat/flow-config"
import type { SecretTextAuthValue } from "@aha.chat/sdk"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { jsonSchema, type ToolSet, tool } from "ai"
import {
  JSON_TYPE,
  TEXT,
} from "../integration/handlers/automated-response/constants"
import {
  callMCPTool,
  cleanSchemaForGemini,
  type MCPAuthSchema,
} from "../integration/handlers/automated-response/mcp"
import { performFileSearch } from "../integration/handlers/automated-response/search"
import { logger } from "./logger"

type DataField = {
  type?: string
  description?: string
  required?: boolean
}

const toolNamePattern = /^[a-zA-Z0-9_-]+$/

export async function getAIIntegrationInDB(props: {
  chatbotId: string
  provider: string
}) {
  const { chatbotId, provider } = props

  switch (provider) {
    case aiProviders.openai:
      return await findOrFail<IntegrationOpenAIModel>(
        integrationOpenAIModel,
        {
          chatbotId,
        },
        `IntegrationOpenAI not found for chatbotId: ${chatbotId}`,
      )
    case aiProviders.gemini:
      return await findOrFail<IntegrationGeminiModel>(
        integrationGeminiModel,
        {
          chatbotId,
        },
        `IntegrationGemini not found for chatbotId: ${chatbotId}`,
      )
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}

export function getAIModel(
  model: IntegrationOpenAIModel | IntegrationGeminiModel,
  provider: string,
) {
  const auth = model.auth as SecretTextAuthValue

  switch (provider) {
    case aiProviders.openai: {
      return createOpenAI({ apiKey: auth.secretText })
    }
    case aiProviders.gemini: {
      return createGoogleGenerativeAI({ apiKey: auth.secretText })
    }
    case aiProviders.claude: {
      return createAnthropic({ apiKey: auth.secretText })
    }
    case aiProviders.deepseek: {
      return createDeepSeek({ apiKey: auth.secretText })
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
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

    const allFiles = await db.query.aiFileModel.findMany({
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
    logger.error(
      error,
      `[automated-response] getAIFileTools failed for chatbotId: ${chatbotId}`,
    )
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

    const aiFunctions = await db.query.aiFunctionModel.findMany({
      where: {
        chatbotId,
        id: {
          in: selectedFunctionIds,
        },
      },
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
    logger.error(
      error,
      `[automated-response] getAIFunctionTools failed for chatbotId: ${chatbotId}`,
    )
    return {}
  }
}

export async function getMCPServerTools(
  chatbotId: string,
  selectedMcpIds: string[],
): Promise<ToolSet> {
  try {
    const tools: ToolSet = {}

    if (selectedMcpIds.length === 0) {
      return tools
    }

    // Find MCP servers from DB
    const mcpServers = await db.query.aiMCPServerModel.findMany({
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

        if (!toolNamePattern.test(uniqueToolName)) {
          continue
        }

        const cleanedSchema = cleanSchemaForGemini(
          toolDef.inputSchema.jsonSchema,
        )

        tools[uniqueToolName] = tool({
          description: `${toolDef.description} (from ${mcpServer.name})`,
          inputSchema: jsonSchema(
            cleanedSchema as Parameters<typeof jsonSchema>[0],
          ),
          execute: async (args: Record<string, unknown>) => {
            return await callMCPTool({
              url: mcpServer.url,
              auth: mcpServer.auth as MCPAuthSchema,
              toolName,
              args,
            })
          },
        })
      }
    }

    return tools
  } catch (error) {
    logger.error(
      error,
      `[automated-response] getMCPServerTools failed for chatbotId: ${chatbotId}`,
    )
    return {}
  }
}
