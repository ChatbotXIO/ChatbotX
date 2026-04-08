import { createAnthropic } from "@ai-sdk/anthropic"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { db } from "@chatbotx.io/database/client"
import { aiMcpServerAuth } from "@chatbotx.io/database/partials"
import type {
  IntegrationGeminiModel,
  IntegrationOpenAIModel,
} from "@chatbotx.io/database/types"
import { aiProviders } from "@chatbotx.io/flow-config"
import { secretTextAuthSchema } from "@chatbotx.io/sdk"
import { jsonSchema, type ToolSet, tool } from "ai"
import { normalizeError } from "universal-error-normalizer"
import { z } from "zod"
import { helpTexts } from "../integration/handlers/automated-response/constants"
import { performFileSearch } from "../integration/handlers/automated-response/search"
import { logger } from "./logger"
import { McpClient, normalizeMcpContent } from "./mcp-client"

const toolNamePattern = /^[a-zA-Z0-9_-]+$/

export async function getAIIntegrationInDB(props: {
  workspaceId: string
  provider: string
  autoReply?: boolean
}) {
  const { workspaceId, provider, autoReply } = props

  const where = {
    workspaceId,
    ...(autoReply === undefined ? {} : { autoReply }),
  }

  switch (provider) {
    case aiProviders.enum.openai:
      return await db.query.integrationOpenaiModel.findFirst({
        where,
      })
    case aiProviders.enum.gemini:
      return await db.query.integrationGeminiModel.findFirst({
        where,
      })
    default:
      return null
  }
}

export function getAIModel(
  model: IntegrationOpenAIModel | IntegrationGeminiModel,
  provider: string,
  _options?: { abortSignal?: AbortSignal },
) {
  const authParsed = secretTextAuthSchema.safeParse(model.auth)
  if (!authParsed.success) {
    throw new Error("Invalid AI integration auth configuration")
  }

  const commonSettings = {
    apiKey: authParsed.data.secretText,
    maxRetries: 3,
  }

  switch (provider) {
    case aiProviders.enum.openai: {
      return createOpenAI(commonSettings)
    }
    case aiProviders.enum.gemini: {
      return createGoogleGenerativeAI(commonSettings)
    }
    case aiProviders.enum.claude: {
      return createAnthropic(commonSettings)
    }
    case aiProviders.enum.deepseek: {
      return createDeepSeek(commonSettings)
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`)
  }
}

export function createAIModelInstance(props: {
  model: IntegrationOpenAIModel | IntegrationGeminiModel
  provider: string
  modelId: string
  abortSignal?: AbortSignal
  traceId?: string
}) {
  const { model, provider, modelId, abortSignal } = props
  const providerInstance = getAIModel(model, provider, { abortSignal })

  return providerInstance(modelId)
}

export async function getAIFileTools(
  workspaceId: string,
  selectedFileIds: string[],
): Promise<ToolSet> {
  try {
    const tools: ToolSet = {}

    if (selectedFileIds.length === 0) {
      return tools
    }

    const allFiles = await db.query.aiFileModel.findMany({
      where: {
        workspaceId,
        id: { in: selectedFileIds },
      },
    })

    if (allFiles.length > 0) {
      tools.search_knowledge_base = tool({
        description: helpTexts.fileSearchDescription,
        inputSchema: z.object({
          query: z.string().describe(helpTexts.fileSearchQueryDescription),
        }),
        execute: async ({ query }) => {
          const config = {
            workspaceId,
            selectedFileIds,
            similarityThreshold: 0.7,
            maxResults: 5,
          }
          return await performFileSearch({ query }, config)
        },
      })
    }

    return tools
  } catch (error) {
    logger.error(
      {
        error,
        workspaceId,
      },
      "[automated-response] getAIFileTools failed",
    )
    return {}
  }
}

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
        execute: async (_args: Record<string, unknown>) =>
          await Promise.resolve(outputMessage),
      })
    }
    return tools
  } catch (error) {
    logger.error(
      {
        error,
        workspaceId,
      },
      "[automated-response] getAIFunctionTools failed",
    )
    return {}
  }
}

export async function getMCPServerTools(
  workspaceId: string,
  selectedMcpIds: string[],
): Promise<{ tools: ToolSet; clients: McpClient[] }> {
  try {
    const tools: ToolSet = {}
    const clients: McpClient[] = []

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
                args as Record<string, unknown>,
              )
              if (result.isError) {
                const errorContent = result.content
                let errorMessage = "MCP tool returned an error"
                if (typeof errorContent === "string") {
                  errorMessage = errorContent
                } else if (
                  Array.isArray(errorContent) &&
                  errorContent[0]?.type === "text"
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
          "[automated-response] Failed to load MCP server tools",
        )
      }
    }

    return { tools, clients }
  } catch (error) {
    const normalized = normalizeError(error)
    logger.error(
      { error: normalized, workspaceId },
      "[automated-response] getMCPServerTools failed",
    )
    return { tools: {}, clients: [] }
  }
}
