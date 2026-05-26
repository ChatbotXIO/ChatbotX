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
import { type DynamicTool, getCachedTools } from "../openapi-loader"

export type CreateMcpServerOptions = {
  getApiKey?: () => string
}

type InputSchema = {
  type: "object"
  properties?: Record<string, unknown>
  required?: string[]
  [key: string]: unknown
}

const NO_BODY_METHODS = new Set(["GET", "HEAD", "DELETE"])

function buildQueryString(params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString()
  return qs ? `?${qs}` : ""
}

async function executeTool(
  tool: DynamicTool,
  args: Record<string, unknown>,
  apiKey: string,
): Promise<{
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
}> {
  let path = tool.pathTemplate

  for (const paramName of tool.pathParamNames) {
    const value = args[paramName]
    if (value === undefined || value === null) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Missing required path parameter: ${paramName}`,
          },
        ],
      }
    }
    path = path.replace(`{${paramName}}`, encodeURIComponent(String(value)))
  }

  const queryArgs: Record<string, string> = {}
  for (const key of tool.queryParamNames) {
    const value = args[key]
    if (value !== undefined && value !== null) {
      queryArgs[key] = String(value)
    }
  }

  const body: Record<string, unknown> = {}
  for (const key of tool.bodyParamNames) {
    if (args[key] !== undefined) {
      body[key] = args[key]
    }
  }

  const url = `${tool.baseUrl}${path}${buildQueryString(queryArgs)}`
  const sendBody =
    !NO_BODY_METHODS.has(tool.method) && tool.bodyParamNames.length > 0

  try {
    const response = await fetch(url, {
      method: tool.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: sendBody ? JSON.stringify(body) : undefined,
    })

    let result: unknown
    const contentType = response.headers.get("content-type") ?? ""
    if (contentType.includes("application/json")) {
      result = await response.json()
    } else {
      result = await response.text()
    }

    if (!response.ok) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error ${response.status}:\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      }
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return {
      isError: true,
      content: [{ type: "text", text: `Request failed: ${message}` }],
    }
  }
}

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

  mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: getCachedTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as InputSchema,
    })),
  }))

  mcpServer.server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params

    const apiKey = getApiKey()
    if (!apiKey) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: "No workspace token configured. Set CHATBOTX_API_KEY in the server environment or pass the token via the ?workspace_token= URL query parameter.",
          },
        ],
      }
    }

    const tool = getCachedTools().find((t) => t.name === name)

    if (!tool) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
      }
    }

    return await executeTool(
      tool,
      (args ?? {}) as Record<string, unknown>,
      apiKey,
    )
  })

  return mcpServer
}
