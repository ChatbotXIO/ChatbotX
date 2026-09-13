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
import { getVisibleTools, refreshOpenApiSpecIfStale } from "../openapi-loader"
import { introspectToken } from "../token-introspection"
import { executeTool } from "./execute-tool"
import {
  findToolByName,
  handleCallTool,
  handleSearchTools,
  META_TOOL_NAMES,
  META_TOOLS,
} from "./meta-tools"

export type CreateMcpServerOptions = {
  getApiKey?: () => string
}

type InputSchema = {
  type: "object"
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}

const NO_API_KEY_MESSAGE =
  "No workspace token configured. Set CHATBOTX_API_KEY in the server environment or pass the token via the ?workspace_token= URL query parameter."

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

  const getApiKey = (): string =>
    options?.getApiKey?.().trim() || env.CHATBOTX_API_KEY

  // Bypass McpServer's high-level tool API to support raw JSON Schema from
  // the OpenAPI spec. We register handlers on the underlying low-level server.
  mcpServer.server.registerCapabilities({ tools: {} })

  mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => {
    await refreshOpenApiSpecIfStale()
    const apiKey = getApiKey()
    const introspection = apiKey ? await introspectToken(apiKey) : null
    // `META_TOOLS` come first: they are the fixed discovery path into the
    // ~300 operations `getVisibleTools()` excludes.
    return {
      tools: [
        ...META_TOOLS,
        ...getVisibleTools(introspection).map((tool) => ({
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

    const apiKey = getApiKey()
    if (!apiKey) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: NO_API_KEY_MESSAGE }],
      }
    }

    if (name in META_TOOL_NAMES) {
      return name === "search_tools"
        ? handleSearchTools(toolArgs)
        : await handleCallTool(toolArgs, apiKey)
    }

    const tool = findToolByName(name)
    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: `Unknown tool: ${name}` }],
      }
    }

    return await executeTool(tool, toolArgs, apiKey)
  })

  return mcpServer
}
