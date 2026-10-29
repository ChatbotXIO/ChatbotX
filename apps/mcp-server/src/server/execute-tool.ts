import { env } from "../env"
import { fetchWithTimeout } from "../http"
import { type DynamicTool, getCachedTools } from "../openapi-loader"
import { type ElicitationClient, enforceHitlGate } from "./hitl-gate"

const NO_BODY_METHODS = new Set(["GET", "HEAD"])

const EMAIL_PATTERN = /^[\w.+-]+@[\w-]+\.[\w.]+$/u
const PHONE_PATTERN = /^\+\d{6,}$/u
const LOCAL_PHONE_PATTERN = /^0\d{8,}$/u
const NUMERIC_ID_PATTERN = /^\d+$/u
const MAX_BARE_ID_LENGTH = 10
const PREFIXED_IDENTIFIER_PATTERN = /^(id|email|phone):/u
const TRAILING_COLON_PATTERN = /:$/u

/**
 * Contact-facing tools accept a prefixed identifier (`id:123`,
 * `email:ada@example.com`, `phone:+841234567890`) — see
 * `apps/builder/src/features/contacts/api/public/tags.ts` and siblings.
 * Agents often pass a bare value instead, which the API then rejects with a
 * 404 `notFoundException`. The shape is unambiguous — an email has an `@`, a
 * phone number starts with `+` or `0` and is otherwise all digits, and a
 * short bare numeric string is an id — so auto-prefixing removes preventable
 * failures without guessing at anything semantically unclear. A value that
 * already carries a recognized prefix, or matches none of the three shapes
 * (e.g. a display name), is passed through unchanged so the API's real
 * validation error still surfaces.
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
  if (NUMERIC_ID_PATTERN.test(value) && value.length < MAX_BARE_ID_LENGTH) {
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

const schemaAllowsNull = (schema: unknown): boolean => {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    return false
  }
  const { anyOf, type } = schema as { anyOf?: unknown; type?: unknown }
  return (
    type === "null" ||
    (Array.isArray(anyOf) && anyOf.some((option) => schemaAllowsNull(option)))
  )
}

const applyNullableRequiredDefaults = (
  tool: DynamicTool,
  args: Record<string, unknown>,
): Record<string, unknown> => {
  let normalizedArguments = args
  for (const key of tool.inputSchema.required ?? []) {
    if (
      args[key] === undefined &&
      schemaAllowsNull(tool.inputSchema.properties[key])
    ) {
      if (normalizedArguments === args) {
        normalizedArguments = { ...args }
      }
      normalizedArguments[key] = null
    }
  }
  return normalizedArguments
}

const preflightArgumentError = (
  tool: DynamicTool,
  args: Record<string, unknown>,
): string | undefined => {
  const missing = (tool.inputSchema.required ?? []).filter(
    (key) =>
      args[key] === undefined ||
      (args[key] === null &&
        !schemaAllowsNull(tool.inputSchema.properties[key])),
  )
  if (missing.length === 0) {
    return
  }
  const declaredKeys = new Set(Object.keys(tool.inputSchema.properties))
  const suspectedWrapper = ["body", "params", "input"].find((key) => {
    const value = args[key]
    return (
      !declaredKeys.has(key) &&
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value)
    )
  })
  const missingList = missing.join(", ")
  return suspectedWrapper
    ? `Missing required field(s): ${missingList}. Arguments must be a flat object matching inputSchema — found a "${suspectedWrapper}" wrapper instead of passing its fields at the top level.`
    : `Missing required field(s): ${missingList}. See the tool's inputSchema for the full shape.`
}

const prepareToolArguments = (
  tool: DynamicTool,
  rawArgs: Record<string, unknown>,
): Record<string, unknown> => applyNullableRequiredDefaults(tool, rawArgs)

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

export type RequestCredentials = {
  token: string
  workspaceId?: string
}

export type ToolExecutionOptions = {
  elicitationClient?: ElicitationClient
}

export type ToolCallResult = {
  content: Array<{ type: "text"; text: string }>
  isError?: boolean
}

const successfulResponseContentTypes = new WeakMap<ToolCallResult, string>()

export const errorResult = (text: string): ToolCallResult => ({
  content: [{ text, type: "text" }],
  isError: true,
})

export const jsonResult = (value: unknown): ToolCallResult => ({
  content: [{ text: JSON.stringify(value, null, 2), type: "text" }],
})

const findCurrentStateTool = (tool: DynamicTool): DynamicTool | undefined => {
  const getToolsByPath = new Map(
    getCachedTools()
      .filter((candidate) => candidate.method === "GET")
      .map((candidate) => [candidate.pathTemplate, candidate]),
  )
  const pathSegments = tool.pathTemplate.split("/")
  for (
    let segmentCount = pathSegments.length;
    segmentCount > 1;
    segmentCount -= 1
  ) {
    const candidate = getToolsByPath.get(
      pathSegments.slice(0, segmentCount).join("/"),
    )
    if (
      candidate &&
      candidate.pathParamNames.length > 0 &&
      candidate.pathParamNames.every((name) =>
        tool.pathParamNames.includes(name),
      )
    ) {
      return candidate
    }
  }
}

const firstLine = (value: string): string =>
  value.split("\n")[0]?.replace(TRAILING_COLON_PATTERN, "") ?? "unknown failure"

const getCurrentState = async (props: {
  args: Record<string, unknown>
  credentials: RequestCredentials
  tool: DynamicTool
}): Promise<{ state: unknown } | { unavailable: string }> => {
  const stateTool = findCurrentStateTool(props.tool)
  if (!stateTool) {
    return { unavailable: "no read operation" }
  }

  const stateArgs = Object.fromEntries(
    stateTool.pathParamNames.map((name) => [name, props.args[name]]),
  )
  const stateResult = await executeTool(
    stateTool,
    stateArgs,
    props.credentials,
    {},
  )
  if (stateResult.isError) {
    return {
      unavailable: firstLine(stateResult.content[0]?.text ?? "unknown failure"),
    }
  }
  if (
    !successfulResponseContentTypes
      .get(stateResult)
      ?.includes("application/json")
  ) {
    return { unavailable: "non-JSON body" }
  }

  try {
    return { state: JSON.parse(stateResult.content[0]?.text ?? "") }
  } catch {
    return { unavailable: "non-JSON body" }
  }
}

/**
 * Fires the HTTP request a `DynamicTool` describes. Shared by the normal
 * `tools/call` path (`create-mcp-server.ts`) and `call_tool`
 * (`meta-tools.ts`) — the latter looks a tool up outside `tools/list`'s
 * `visibility: "default"` filter, but execution is identical either way.
 */
export async function executeTool(
  tool: DynamicTool,
  rawArgs: Record<string, unknown>,
  credentials: RequestCredentials,
  options: ToolExecutionOptions = {},
): Promise<ToolCallResult> {
  const preparedArguments = prepareToolArguments(tool, rawArgs)
  const preflightError = preflightArgumentError(tool, preparedArguments)
  if (preflightError) {
    return errorResult(preflightError)
  }

  let args = normalizeToolArguments(preparedArguments)
  try {
    const hitlGate = await enforceHitlGate({
      args,
      elicitationClient: options.elicitationClient,
      getCurrentState: async () =>
        await getCurrentState({
          args,
          credentials,
          tool,
        }),
      tool,
    })
    if (hitlGate.failure) {
      return errorResult(JSON.stringify(hitlGate.failure, null, 2))
    }
    args = hitlGate.args
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown confirmation error"
    return errorResult(`Confirmation failed: ${message}`)
  }

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
          Authorization: `Bearer ${credentials.token}`,
          "Content-Type": "application/json",
          ...(credentials.workspaceId
            ? { "x-workspace-id": credentials.workspaceId }
            : {}),
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

    const toolResult = jsonResult(result)
    successfulResponseContentTypes.set(toolResult, contentType)
    return toolResult
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return errorResult(error.message)
    }
    const message = error instanceof Error ? error.message : "Unknown error"
    return errorResult(`Request failed: ${message}`)
  }
}
