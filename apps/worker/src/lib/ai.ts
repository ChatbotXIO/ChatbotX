import { createAnthropic } from "@ai-sdk/anthropic"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { db } from "@chatbotx.io/database/client"
import type {
  IntegrationGeminiModel,
  IntegrationOpenAIModel,
} from "@chatbotx.io/database/types"
import { aiProviders } from "@chatbotx.io/flow-config"
import type { SecretTextAuthValue } from "@chatbotx.io/sdk"
import { type ToolSet, tool } from "ai"
import { z } from "zod"
import { helpTexts } from "../integration/handlers/automated-response/constants"
import {
  callMCPTool,
  type MCPAuthSchema,
} from "../integration/handlers/automated-response/mcp"
import { performFileSearch } from "../integration/handlers/automated-response/search"
import { logger } from "./logger"
import { ensureRecord, isRecord } from "./utils"

const toolNamePattern = /^[a-zA-Z0-9_-]+$/

function jsonSchemaToZodObject(schema: unknown, depth = 0): z.ZodTypeAny {
  if (depth > 6) {
    return z.object({}).passthrough()
  }

  if (!isRecord(schema)) {
    return z.object({}).passthrough()
  }

  const schemaDescription =
    typeof schema.description === "string" ? schema.description : undefined

  const withDescription = (zodType: z.ZodTypeAny) =>
    schemaDescription ? zodType.describe(schemaDescription) : zodType

  const properties = isRecord(schema.properties) ? schema.properties : {}
  const required = Array.isArray(schema.required)
    ? schema.required.filter((v): v is string => typeof v === "string")
    : []
  const requiredSet = new Set(required)

  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [key, propSchema] of Object.entries(properties)) {
    const propZod = jsonSchemaToZodValue(propSchema, depth + 1)
    shape[key] = requiredSet.has(key) ? propZod : propZod.optional()
  }

  return withDescription(z.object(shape).passthrough())
}

function jsonSchemaToZodValue(schema: unknown, depth = 0): z.ZodTypeAny {
  if (depth > 6) {
    return z.unknown()
  }
  if (!isRecord(schema)) {
    return z.unknown()
  }

  const schemaType = schema.type

  if (schemaType === "string") {
    return z.string()
  }
  if (schemaType === "number" || schemaType === "integer") {
    return z.number()
  }
  if (schemaType === "boolean") {
    return z.boolean()
  }
  if (schemaType === "array") {
    return z.array(jsonSchemaToZodValue(schema.items, depth + 1))
  }
  if (schemaType === "object" || isRecord(schema.properties)) {
    return jsonSchemaToZodObject(schema, depth + 1)
  }

  return z.unknown()
}

const OMIT_NORMALIZED_FIELD = Symbol("omit-normalized-field")

function getRequiredSchemaFields(schema: unknown): Set<string> {
  if (!(isRecord(schema) && Array.isArray(schema.required))) {
    return new Set()
  }
  return new Set(
    schema.required.filter(
      (field): field is string => typeof field === "string",
    ),
  )
}

function normalizeValueBySchema(
  value: unknown,
  schema: unknown,
  isRequired: boolean,
): unknown | typeof OMIT_NORMALIZED_FIELD {
  if (!isRecord(schema)) {
    return value
  }

  const schemaType = schema.type

  if (value === null) {
    return OMIT_NORMALIZED_FIELD
  }

  if (typeof value === "string" && schemaType === "string") {
    const trimmed = value.trim()
    if (trimmed.length === 0 && !isRequired) {
      return OMIT_NORMALIZED_FIELD
    }
    return trimmed
  }

  if (Array.isArray(value) && schemaType === "array") {
    const normalizedItems = value
      .map((item) => {
        const normalizedItem = normalizeValueBySchema(item, schema.items, false)
        return normalizedItem === OMIT_NORMALIZED_FIELD ? null : normalizedItem
      })
      .filter((item): item is Exclude<typeof item, null> => item !== null)

    if (normalizedItems.length === 0 && !isRequired) {
      return OMIT_NORMALIZED_FIELD
    }

    return normalizedItems
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed.length === 0 && !isRequired) {
      return OMIT_NORMALIZED_FIELD
    }
    return trimmed
  }

  if (!isRecord(value)) {
    return value
  }

  if (schemaType !== "object" && !isRecord(schema.properties)) {
    return value
  }

  const properties = ensureRecord(schema.properties)
  const requiredFields = getRequiredSchemaFields(schema)
  const normalizedObject: Record<string, unknown> = {}
  let missingRequiredField = false

  for (const [key, rawValue] of Object.entries(value)) {
    const childIsRequired = requiredFields.has(key)
    const normalizedValue = normalizeValueBySchema(
      rawValue,
      properties[key],
      childIsRequired,
    )

    if (normalizedValue === OMIT_NORMALIZED_FIELD) {
      if (childIsRequired) {
        missingRequiredField = true
      }
      continue
    }

    normalizedObject[key] = normalizedValue
  }

  for (const requiredField of requiredFields) {
    if (!(requiredField in normalizedObject)) {
      missingRequiredField = true
    }
  }

  if (missingRequiredField && !isRequired) {
    return OMIT_NORMALIZED_FIELD
  }

  if (Object.keys(normalizedObject).length === 0 && !isRequired) {
    return OMIT_NORMALIZED_FIELD
  }

  return normalizedObject
}

function normalizeMCPToolArgsBySchema(
  args: Record<string, unknown>,
  schema: unknown,
): Record<string, unknown> {
  const normalized = normalizeValueBySchema(args, schema, true)
  return isRecord(normalized) ? normalized : args
}

const mcpAvailableToolsSchema = z.record(
  z.string(),
  z
    .object({
      description: z.string().default(""),
      inputSchema: z
        .object({
          jsonSchema: z.unknown(),
        })
        .optional(),
    })
    .passthrough(),
)

export function normalizeAIModelId(modelId: string): string {
  const trimmed = modelId.trim()
  if (!trimmed) {
    return trimmed
  }

  const lastSlash = trimmed.lastIndexOf("/")
  if (lastSlash >= 0 && lastSlash < trimmed.length - 1) {
    return trimmed.slice(lastSlash + 1)
  }

  const lastColon = trimmed.lastIndexOf(":")
  if (lastColon >= 0 && lastColon < trimmed.length - 1) {
    return trimmed.slice(lastColon + 1)
  }

  return trimmed
}

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
) {
  const auth = model.auth as SecretTextAuthValue

  const commonSettings = {
    apiKey: auth.secretText,
    fetch: globalThis.fetch,
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
  const { model, provider, modelId } = props
  const providerInstance = getAIModel(model, provider)
  const normalizedModelId = normalizeAIModelId(modelId)

  return providerInstance(normalizedModelId)
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
): Promise<ToolSet> {
  try {
    const tools: ToolSet = {}

    if (selectedMcpIds.length === 0) {
      return tools
    }

    // Find MCP servers from DB
    const mcpServers = await db.query.aiMCPServerModel.findMany({
      where: {
        workspaceId,
        id: { in: selectedMcpIds },
      },
    })
    if (mcpServers.length === 0) {
      return tools
    }

    for (const mcpServer of mcpServers) {
      const availableToolsParsed = mcpAvailableToolsSchema.safeParse(
        mcpServer.availableTools,
      )
      if (!availableToolsParsed.success) {
        continue
      }

      const availableTools = availableToolsParsed.data
      if (!availableTools || typeof availableTools !== "object") {
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

        const jsonSchema = toolDef.inputSchema?.jsonSchema
        const inputSchema = jsonSchema
          ? jsonSchemaToZodObject(jsonSchema)
          : z.looseObject({})

        tools[uniqueToolName] = tool({
          description: `${toolDef.description} (from ${mcpServer.name})`,
          inputSchema,
          execute: async (args) => {
            const safeArgs = ensureRecord(args)
            const normalizedArgs = normalizeMCPToolArgsBySchema(
              safeArgs,
              jsonSchema,
            )
            return await callMCPTool({
              url: mcpServer.url,
              auth: mcpServer.auth as MCPAuthSchema,
              toolName,
              args: normalizedArgs,
            })
          },
        })
      }
    }

    return tools
  } catch (error) {
    logger.error(
      {
        error,
        workspaceId,
      },
      "[automated-response] getMCPServerTools failed",
    )
    return {}
  }
}
