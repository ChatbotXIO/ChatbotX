import { getChildLogger } from "@chatbotx.io/logger"
import { env } from "../env"
import { isVisibleForScope } from "../openapi-loader"
import {
  errorResult,
  jsonResult,
  normalizeToolArguments,
  type RequestCredentials,
  sendApiRequest,
  type ToolCallResult,
} from "../server/execute-tool"
import type { TokenIntrospection } from "../token-introspection"
import { GUIDE_URI_PREFIX } from "./guide-uri"
import { type JsonSchema, validateAgainstSchema } from "./json-schema-validate"
import {
  OPENAI_GUIDE_NAMES,
  OPENAI_GUIDES,
  OPENAI_INSTRUCTIONS,
  type OpenAiGuideName,
} from "./openai-guides"
import manifestJson from "./openai-manifest.json"
import { projectResponse, ResponseContractError } from "./project-response"

export type OpenAiTool = {
  adapterBody: Record<string, unknown>
  alwaysVisible: boolean
  annotations: {
    destructiveHint: boolean
    idempotentHint: boolean
    openWorldHint: boolean
    readOnlyHint: boolean
    title: string
  }
  bodyParamNames: string[]
  description: string
  hitlPolicy:
    | "none"
    | "confirm_diff"
    | "confirm_destructive"
    | "confirm_outbound"
  inputSchema: JsonSchema
  method: string
  name: string
  pathParamNames: string[]
  pathTemplate: string
  queryParamNames: string[]
  responseSchema: JsonSchema | null
  scope?: string | string[]
}

type Manifest = { contractVersion: string; tools: OpenAiTool[] }

const manifest = manifestJson as unknown as Manifest

export const OPENAI_PROFILE_INSTRUCTIONS = OPENAI_INSTRUCTIONS

const logger = getChildLogger("mcp-server")

const toolsByName = new Map(manifest.tools.map((tool) => [tool.name, tool]))
const TRAILING_SLASH = /\/$/
const apiBaseUrl = (): string =>
  env.CHATBOTX_API_URL.replace(TRAILING_SLASH, "")

const SECURITY_SCHEMES = [{ type: "oauth2" }]

const OPENAI_GUIDE_TOOL = {
  name: "get_guide",
  annotations: {
    title: "Get guide",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  description:
    "Read a usage guide for a workflow: approvals, contacts and pipelines, or inbox handling.",
  inputSchema: {
    type: "object",
    properties: { name: { enum: [...OPENAI_GUIDE_NAMES], type: "string" } },
    required: ["name"],
    additionalProperties: false,
  },
  securitySchemes: SECURITY_SCHEMES,
  _meta: { securitySchemes: SECURITY_SCHEMES },
} as const

/**
 * The `tools/list` surface: manifest tools the calling token may use (same
 * permission/scope rule as the default profile), plus `get_guide`.
 */
export const listOpenAiTools = (introspection: TokenIntrospection | null) => [
  ...manifest.tools
    .filter((tool) => isVisibleForScope(tool, introspection))
    .map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as {
        type: "object"
        [key: string]: unknown
      },
      annotations: tool.annotations,
      securitySchemes: SECURITY_SCHEMES,
      _meta: { securitySchemes: SECURITY_SCHEMES },
    })),
  OPENAI_GUIDE_TOOL,
]

export const openAiGuideResources = () =>
  OPENAI_GUIDE_NAMES.map((name) => ({
    name,
    uri: `${GUIDE_URI_PREFIX}${name}`,
    ...OPENAI_GUIDES[name],
  }))

export const handleOpenAiGuide = (
  args: Record<string, unknown>,
): ToolCallResult => {
  const name = args.name
  if (
    typeof name !== "string" ||
    !OPENAI_GUIDE_NAMES.includes(name as OpenAiGuideName)
  ) {
    return errorResult(
      `Unknown guide. Use one of: ${OPENAI_GUIDE_NAMES.join(", ")}`,
    )
  }
  return {
    content: [
      { text: OPENAI_GUIDES[name as OpenAiGuideName].content, type: "text" },
    ],
  }
}

// Neutral wording: one server serves every white-label tenant.
const STATUS_MESSAGES: Record<number, string> = {
  400: "The request was not accepted. Check the arguments.",
  401: "Authorization is required. Reconnect the account.",
  403: "This account is not permitted to do that.",
  404: "The record was not found.",
  409: "The request conflicts with the current state.",
  422: "The request failed validation. Check the arguments.",
  429: "Too many requests. Try again later.",
}

const statusMessage = (status: number): string =>
  STATUS_MESSAGES[status] ??
  (status >= 500
    ? "The service is temporarily unavailable."
    : "The request failed.")

type ApiOutcome =
  | { ok: true; body: unknown }
  | { ok: false; message: string; status: number }

/** Network failures, timeouts and aborts: the upstream was not reached. */
const isTransportError = (error: unknown): boolean =>
  error instanceof TypeError ||
  (error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError"))

const readBody = async (response: Response): Promise<unknown> => {
  if (response.status === 204) {
    return
  }
  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    return await response.json()
  }
  const text = await response.text()
  return text.length === 0 ? undefined : text
}

const callApi = async (
  tool: OpenAiTool,
  args: Record<string, unknown>,
  credentials: RequestCredentials,
): Promise<ApiOutcome> => {
  try {
    const sent = await sendApiRequest(
      { ...tool, baseUrl: apiBaseUrl() },
      args,
      credentials,
    )
    if ("invalidPathParam" in sent) {
      return {
        ok: false,
        message: `Missing or invalid path parameter ${sent.invalidPathParam}.`,
        status: 400,
      }
    }
    const { response } = sent
    if (!response.ok) {
      return {
        ok: false,
        message: statusMessage(response.status),
        status: response.status,
      }
    }
    return { ok: true, body: await readBody(response) }
  } catch (error) {
    if (isTransportError(error)) {
      return {
        ok: false,
        message: "The service could not be reached.",
        status: 502,
      }
    }
    logger.error(
      { err: error, tool: tool.name },
      "OpenAI profile API call failed",
    )
    return {
      ok: false,
      message: "The service returned a response that could not be read.",
      status: 502,
    }
  }
}

const project = (tool: OpenAiTool, body: unknown): unknown =>
  projectResponse(tool.responseSchema, body)

/** The read tool that shows current state for a mutation, from the manifest only. */
const findConfirmationRead = (tool: OpenAiTool): OpenAiTool | undefined => {
  const segments = tool.pathTemplate.split("/")
  for (let count = segments.length; count > 1; count -= 1) {
    const prefix = segments.slice(0, count).join("/")
    const candidate = manifest.tools.find(
      (item) =>
        item.method === "GET" &&
        item.pathTemplate === prefix &&
        item.pathParamNames.length > 0 &&
        item.pathParamNames.every((name) => tool.pathParamNames.includes(name)),
    )
    if (candidate) {
      return candidate
    }
  }
}

const currentState = async (
  tool: OpenAiTool,
  args: Record<string, unknown>,
  credentials: RequestCredentials,
): Promise<{ currentState: unknown } | { currentStateUnavailable: string }> => {
  const read = findConfirmationRead(tool)
  if (!read) {
    return { currentStateUnavailable: "no reviewed read operation" }
  }
  const outcome = await callApi(
    read,
    Object.fromEntries(read.pathParamNames.map((name) => [name, args[name]])),
    credentials,
  )
  if (!outcome.ok) {
    return { currentStateUnavailable: "unavailable" }
  }
  try {
    return { currentState: project(read, outcome.body) }
  } catch (error) {
    if (!(error instanceof ResponseContractError)) {
      logger.error(
        { err: error, tool: read.name },
        "OpenAI profile current-state projection failed",
      )
    }
    return { currentStateUnavailable: "unavailable" }
  }
}

export const executeOpenAiTool = async (
  name: string,
  rawArgs: Record<string, unknown>,
  credentials: RequestCredentials,
): Promise<ToolCallResult> => {
  const tool = toolsByName.get(name)
  if (!tool) {
    return errorResult(`Unknown tool: ${name}`)
  }

  const args = normalizeToolArguments(rawArgs)
  const { _confirm, ...proposed } = args
  // A tool without the approval step has no `_confirm` in its schema; a
  // stray one from the model is ignored rather than rejected.
  const problems = validateAgainstSchema(
    tool.inputSchema,
    tool.hitlPolicy === "none" ? proposed : args,
  )
  if (problems.length > 0) {
    return errorResult(
      `Invalid arguments:\n${problems.slice(0, 10).join("\n")}`,
    )
  }

  if (tool.hitlPolicy !== "none" && _confirm !== true) {
    // A pending approval, not a failure: the model shows it and asks the user.
    const state = await currentState(tool, proposed, credentials)
    return jsonResult({
      code: "CONFIRMATION_REQUIRED",
      ...state,
      policy: tool.hitlPolicy,
      proposed,
      tool: tool.name,
    })
  }

  const outcome = await callApi(tool, proposed, credentials)
  if (!outcome.ok) {
    return errorResult(`Error ${outcome.status}: ${outcome.message}`)
  }
  try {
    return jsonResult(project(tool, outcome.body))
  } catch (error) {
    if (!(error instanceof ResponseContractError)) {
      throw error
    }
    return errorResult(
      tool.annotations.readOnlyHint
        ? "The response did not match the reviewed contract and was withheld."
        : "The action may have completed, but the response could not be returned safely. Do not repeat it automatically; check the current state.",
    )
  }
}
