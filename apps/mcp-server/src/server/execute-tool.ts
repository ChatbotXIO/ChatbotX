import { env } from "../env"
import { fetchWithTimeout } from "../http"
import type { DynamicTool } from "../openapi-loader"

const NO_BODY_METHODS = new Set(["GET", "HEAD"])

const EMAIL_PATTERN = /^[\w.+-]+@[\w-]+\.[\w.]+$/u
const PHONE_PATTERN = /^\+\d{6,}$/u
const LOCAL_PHONE_PATTERN = /^0\d{8,}$/u
const NUMERIC_ID_PATTERN = /^\d+$/u
const PREFIXED_IDENTIFIER_PATTERN = /^(id|email|phone):/u

/**
 * Contact-facing tools accept a prefixed identifier (`id:123`,
 * `email:ada@example.com`, `phone:+841234567890`) — see
 * `apps/builder/src/features/contacts/api/public/tags.ts` and siblings.
 * Agents often pass a bare value instead, which the API then rejects with a
 * 422. The shape is unambiguous — an email has an `@`, a phone number starts
 * with `+` or `0` and is otherwise all digits, and a bare numeric string is
 * an id — so auto-prefixing removes preventable failures without guessing at
 * anything semantically unclear. A value that already carries a recognized
 * prefix, or matches none of the three shapes (e.g. a display name), is
 * passed through unchanged so the API's real validation error still surfaces.
 */
function withNormalizedIdentifier(value: unknown): unknown {
  if (typeof value !== "string") {
    return value
  }
  if (PREFIXED_IDENTIFIER_PATTERN.test(value)) {
    return value
  }
  if (EMAIL_PATTERN.test(value)) {
    return `email:${value}`
  }
  if (PHONE_PATTERN.test(value) || LOCAL_PHONE_PATTERN.test(value)) {
    return `phone:${value}`
  }
  if (NUMERIC_ID_PATTERN.test(value)) {
    return `id:${value}`
  }
  return value
}

/**
 * Applies `withNormalizedIdentifier` to every argument literally named
 * `identifier` — the consistent parameter name every contact-identifier
 * tool uses, in both path params (`contacts.get`) and body fields
 * (`contacts.addTagsByName`). Every other argument passes through
 * untouched; this never rewrites ids, emails, or phone numbers under a
 * different key.
 */
export function normalizeToolArguments(
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (!("identifier" in args)) {
    return args
  }
  return {
    ...args,
    identifier: withNormalizedIdentifier(args.identifier),
  }
}

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
  rawArgs: Record<string, unknown>,
  apiKey: string,
): Promise<ToolCallResult> {
  const args = normalizeToolArguments(rawArgs)
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
    !NO_BODY_METHODS.has(tool.method) && tool.bodyParamNames.length > 0

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
