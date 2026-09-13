import type { DynamicTool } from "../openapi-loader"

const NO_BODY_METHODS: Record<string, true> = {
  GET: true,
  HEAD: true,
  DELETE: true,
}

function buildQueryString(params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString()
  return qs ? `?${qs}` : ""
}

export type ToolCallResult = {
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
}

/**
 * Fires the HTTP request a `DynamicTool` describes. Shared by the normal
 * `tools/call` path (`create-mcp-server.ts`) and `call_tool`
 * (`meta-tools.ts`) — the latter looks a tool up outside `tools/list`'s
 * `visibility: "default"` filter, but execution is identical either way.
 */
export async function executeTool(
  tool: DynamicTool,
  args: Record<string, unknown>,
  apiKey: string,
): Promise<ToolCallResult> {
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
    !NO_BODY_METHODS[tool.method] && tool.bodyParamNames.length > 0

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
