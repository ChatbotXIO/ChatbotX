import { printResult } from "./commands/utils"
import type { DynamicTool } from "./openapi-loader"

function buildQueryString(params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString()
  return qs ? `?${qs}` : ""
}

const NO_BODY_METHODS = new Set(["GET", "HEAD", "DELETE"])

export async function executeDynamicCommand(
  tool: DynamicTool,
  params: Record<string, string>,
  config: { apiKey: string; apiUrl: string },
): Promise<void> {
  let path = tool.pathTemplate

  for (const paramName of tool.pathParamNames) {
    const value = params[paramName]
    if (!value) {
      throw new Error(`Missing required path parameter: ${paramName}`)
    }
    path = path.replace(`{${paramName}}`, encodeURIComponent(value))
  }

  const queryArgs: Record<string, string> = {}
  for (const key of tool.queryParamNames) {
    const value = params[key]
    if (value !== undefined) {
      queryArgs[key] = value
    }
  }

  const body: Record<string, string> = {}
  for (const key of tool.bodyParamNames) {
    const value = params[key]
    if (value !== undefined) {
      body[key] = value
    }
  }

  const baseUrl = tool.baseUrl.startsWith("http")
    ? tool.baseUrl
    : `${config.apiUrl}${tool.baseUrl}`
  const url = `${baseUrl}${path}${buildQueryString(queryArgs)}`
  const sendBody =
    !NO_BODY_METHODS.has(tool.method) && tool.bodyParamNames.length > 0

  const response = await fetch(url, {
    method: tool.method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
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
    throw new Error(
      `Error ${response.status}: ${JSON.stringify(result, null, 2)}`,
    )
  }

  printResult(result)
}
