import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import {
  name as packageName,
  version as packageVersion,
} from "../../package.json"
import { env } from "../env"
import { getGuide, guideNames } from "../guides"
import {
  getToolByName,
  getVisibleTools,
  refreshOpenApiSpecIfStale,
} from "../openapi-loader"
import {
  CLAUDE_PROFILE_INSTRUCTIONS,
  claudeGuideResources,
  getClaudeTool,
  handleClaudeGuide,
  listClaudeTools,
} from "../profiles/claude"
import {
  executeOpenAiTool,
  handleOpenAiGuide,
  listOpenAiTools,
  OPENAI_PROFILE_INSTRUCTIONS,
  openAiGuideResources,
} from "../profiles/openai"
import { introspectToken } from "../token-introspection"
import {
  errorResult,
  executeTool,
  type RequestCredentials,
} from "./execute-tool"
import {
  handleCallTool,
  handleGetGuide,
  handleSearchTools,
  META_TOOLS,
} from "./meta-tools"

export type McpProfile = "default" | "openai" | "claude"

export type CreateMcpServerOptions = {
  /** Fixed tool profile. Selected by the transport path, never by arguments. */
  profile?: McpProfile
  getCredentials?: () => RequestCredentials | undefined
}

type InputSchema = {
  type: "object"
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}

const NO_CREDENTIAL_MESSAGE =
  "No credential. Authorize this MCP server with OAuth, or set CHATBOTX_API_KEY / pass ?workspace_token=."

type GuideResource = {
  content: string
  description: string
  name: string
  uri: string
}

const registerGuideResources = (
  mcpServer: McpServer,
  guides: GuideResource[],
): void => {
  for (const guide of guides) {
    mcpServer.registerResource(
      `guide-${guide.name}`,
      guide.uri,
      { description: guide.description, mimeType: "text/markdown" },
      async (uri) => ({
        contents: [
          { mimeType: "text/markdown", text: guide.content, uri: uri.href },
        ],
      }),
    )
  }
}

/**
 * The Claude connector profile: a fixed allow-list of live operations, each
 * its own tool, plus `get_guide`. OAuth only (the transport rejects anything
 * else); never the environment API key.
 */
const configureClaudeProfile = (
  mcpServer: McpServer,
  getCredentials: () => RequestCredentials | undefined,
): void => {
  registerGuideResources(mcpServer, claudeGuideResources())
  mcpServer.server.registerCapabilities({ tools: {} })
  mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => {
    await refreshOpenApiSpecIfStale()
    const credentials = getCredentials()
    const introspection = credentials
      ? await introspectToken(credentials.token, credentials.workspaceId)
      : null
    return {
      tools: listClaudeTools(
        introspection?.status === "ok" ? introspection.data : null,
      ),
    }
  })
  mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const toolArgs = (args ?? {}) as Record<string, unknown>
    if (name === "get_guide") {
      return handleClaudeGuide(toolArgs)
    }
    const credentials = getCredentials()
    if (!credentials) {
      return errorResult(NO_CREDENTIAL_MESSAGE)
    }
    await refreshOpenApiSpecIfStale()
    const tool = getClaudeTool(name)
    if (!tool) {
      return errorResult(`Unknown tool: ${name}`)
    }
    return await executeTool(tool, toolArgs, credentials)
  })
}

export const createMcpServer = (
  options?: CreateMcpServerOptions,
): McpServer => {
  const profile = options?.profile ?? "default"
  const isOpenAi = profile === "openai"
  const instructionsByProfile: Record<McpProfile, string | undefined> = {
    claude: CLAUDE_PROFILE_INSTRUCTIONS,
    default: env.CHATBOTX_MCP_SERVER_INSTRUCTIONS,
    openai: OPENAI_PROFILE_INSTRUCTIONS,
  }
  const mcpServer = new McpServer(
    {
      name: env.CHATBOTX_MCP_SERVER_NAME ?? packageName,
      version: packageVersion,
    },
    { instructions: instructionsByProfile[profile] },
  )

  // Connector profiles never fall back to the environment API key.
  const getCredentials = (): RequestCredentials | undefined =>
    options?.getCredentials?.() ??
    (profile === "default" && env.CHATBOTX_API_KEY
      ? { token: env.CHATBOTX_API_KEY }
      : undefined)

  if (profile === "claude") {
    configureClaudeProfile(mcpServer, getCredentials)
    return mcpServer
  }

  if (isOpenAi) {
    registerGuideResources(mcpServer, openAiGuideResources())
    mcpServer.server.registerCapabilities({ tools: {} })
    mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: listOpenAiTools(),
    }))
    mcpServer.server.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        const { name, arguments: args } = request.params
        const toolArgs = (args ?? {}) as Record<string, unknown>
        const credentials = getCredentials()
        if (!credentials) {
          return errorResult(NO_CREDENTIAL_MESSAGE)
        }
        if (name === "get_guide") {
          return handleOpenAiGuide(toolArgs)
        }
        return await executeOpenAiTool(name, toolArgs, credentials)
      },
    )
    return mcpServer
  }

  registerGuideResources(
    mcpServer,
    guideNames.map((name) => getGuide(name)),
  )

  // Bypass McpServer's high-level tool API to support raw JSON Schema from
  // the OpenAPI spec. We register handlers on the underlying low-level server.
  mcpServer.server.registerCapabilities({ tools: {} })

  mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => {
    await refreshOpenApiSpecIfStale()
    const credentials = getCredentials()
    const introspection = credentials
      ? await introspectToken(credentials.token, credentials.workspaceId)
      : null
    // `META_TOOLS` come first: they are the fixed discovery path into the
    // ~300 operations `getVisibleTools()` excludes.
    return {
      tools: [
        ...META_TOOLS,
        ...getVisibleTools(
          introspection?.status === "ok" ? introspection.data : null,
        ).map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema as InputSchema,
          annotations: tool.annotations,
        })),
      ],
    }
  })

  mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params
    const toolArgs = (args ?? {}) as Record<string, unknown>

    // `search_tools` is read-only discovery over the cached tool list — it
    // needs no workspace token, unlike `call_tool` and every regular tool.
    if (name === "search_tools") {
      return handleSearchTools(toolArgs)
    }

    const credentials = getCredentials()
    if (name === "get_guide") {
      return handleGetGuide(toolArgs)
    }

    if (!credentials) {
      return errorResult(NO_CREDENTIAL_MESSAGE)
    }

    if (name === "call_tool") {
      return await handleCallTool(toolArgs, credentials)
    }
    const tool = getToolByName(name)
    if (!tool) {
      return errorResult(`Unknown tool: ${name}`)
    }

    return await executeTool(tool, toolArgs, credentials)
  })

  return mcpServer
}
