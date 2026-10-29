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
import {
  getToolByName,
  getVisibleTools,
  refreshOpenApiSpecIfStale,
} from "../openapi-loader"
import { introspectToken } from "../token-introspection"
import {
  errorResult,
  executeTool,
  type RequestCredentials,
} from "./execute-tool"
import { handleCallTool, handleSearchTools, META_TOOLS } from "./meta-tools"

export type CreateMcpServerOptions = {
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

export const createMcpServer = (
  options?: CreateMcpServerOptions,
): McpServer => {
  const mcpServer = new McpServer(
    {
      name: env.CHATBOTX_MCP_SERVER_NAME ?? packageName,
      version: packageVersion,
    },
    { instructions: env.CHATBOTX_MCP_SERVER_INSTRUCTIONS },
  )

  const getCredentials = (): RequestCredentials | undefined =>
    options?.getCredentials?.() ??
    (env.CHATBOTX_API_KEY ? { token: env.CHATBOTX_API_KEY } : undefined)

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
