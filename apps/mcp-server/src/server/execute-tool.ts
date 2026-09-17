import { env } from "../env"
import { fetchWithTimeout } from "../http"
import type { DynamicTool } from "../openapi-loader"

const NO_BODY_METHODS: Record<string, true> = { GET: true, HEAD: true }

const appendQueryParam = (
  params: URLSearchParams,
  key: string,
  value: unknown,
): void => {
  if (value === undefined || value === null) {
    return
  }

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      appendQueryParam(params, `${key}[${index}]`, item)
    }
    return
  }

  if (typeof value === "object") {
    for (const [childKey, childValue] of Object.entries(value)) {
      appendQueryParam(params, `${key}[${childKey}]`, childValue)
    }
    return
  }

  params.append(key, String(value))
}

const buildQueryString = (params: URLSearchParams): string => {
  const queryString = params.toString()
  return queryString ? `?${queryString}` : ""
}

export type ToolCallResult = {
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
}

export const errorResult = (text: string): ToolCallResult => ({
  content: [{ text, type: "text" }],
  isError: true,
})

export const jsonResult = (value: unknown): ToolCallResult => ({
  content: [{ text: JSON.stringify(value, null, 2), type: "text" }],
})

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
      return errorResult(`Missing required path parameter: ${paramName}`)
    }
    path = path.replace(`{${paramName}}`, encodeURIComponent(String(value)))
  }

  const queryParams = new URLSearchParams()
  for (const key of tool.queryParamNames) {
    appendQueryParam(queryParams, key, args[key])
  }

  const body: Record<string, unknown> = {}
  for (const key of tool.bodyParamNames) {
    if (args[key] !== undefined) {
      body[key] = args[key]
    }
  }

  const url = `${tool.baseUrl}${path}${buildQueryString(queryParams)}`
  const sendBody =
    !NO_BODY_METHODS[tool.method] && tool.bodyParamNames.length > 0

  try {
    const response = await fetchWithTimeout(
      url,
      {
        body: sendBody ? JSON.stringify(body) : undefined,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        method: tool.method,
      },
      env.CHATBOTX_HTTP_TIMEOUT_MS,
    )

    let result: unknown
    const contentType = response.headers.get("content-type") ?? ""
    if (contentType.includes("application/json")) {
      result = await response.json()
    } else {
      result = await response.text()
    }

    if (!response.ok) {
      return errorResult(
        `Error ${response.status}:\n${JSON.stringify(result, null, 2)}`,
      )
    }

    return jsonResult(result)
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return errorResult(error.message)
    }
    const message = error instanceof Error ? error.message : "Unknown error"
    return errorResult(`Request failed: ${message}`)
  }
}
