import { getChildLogger } from "@chatbotx.io/logger"
import { env } from "../env"
import { fetchWithTimeout } from "../http"
import {
  appendQueryParam,
  buildQueryString,
  errorResult,
  jsonResult,
  normalizeToolArguments,
  type RequestCredentials,
  type ToolCallResult,
} from "../server/execute-tool"
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
}

type Manifest = { contractVersion: string; tools: OpenAiTool[] }

const manifest = manifestJson as unknown as Manifest

export const OPENAI_PROFILE_INSTRUCTIONS = OPENAI_INSTRUCTIONS

const logger = getChildLogger("mcp-server")

const toolsByName = new Map(manifest.tools.map((tool) => [tool.name, tool]))
const TRAILING_SLASH = /\/$/
const OPENAI_BASE_URL = (): string =>
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
    "Read a ChatbotX usage guide for a workflow: approvals, contacts and pipelines, or inbox handling.",
  inputSchema: {
    type: "object",
    properties: { name: { enum: [...OPENAI_GUIDE_NAMES], type: "string" } },
    required: ["name"],
    additionalProperties: false,
  },
  securitySchemes: SECURITY_SCHEMES,
  _meta: { securitySchemes: SECURITY_SCHEMES },
} as const

export const listOpenAiTools = () => [
  ...manifest.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema as { type: "object"; [key: string]: unknown },
    annotations: tool.annotations,
    securitySchemes: SECURITY_SCHEMES,
    _meta: { securitySchemes: SECURITY_SCHEMES },
  })),
  OPENAI_GUIDE_TOOL,
]

export const getOpenAiTool = (name: string): OpenAiTool | undefined =>
  toolsByName.get(name)

export const openAiGuideResources = () =>
  OPENAI_GUIDE_NAMES.map((name) => ({
    name,
    uri: `chatbotx://guides/${name}`,
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
    ? "ChatbotX is temporarily unavailable."
    : "The request failed.")

type ApiOutcome =
  | { ok: true; body: unknown }
  | { ok: false; message: string; status: number }

/** Network failures, timeouts and aborts: the upstream was not reached. */
const isTransportError = (error: unknown): boolean =>
  error instanceof TypeError ||
  (error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError"))

const callApi = async (
  tool: OpenAiTool,
  args: Record<string, unknown>,
  credentials: RequestCredentials,
): Promise<ApiOutcome> => {
  let path = tool.pathTemplate
  for (const name of tool.pathParamNames) {
    const value = args[name]
    if (value === undefined || value === null) {
      return {
        ok: false,
        message: `Missing path parameter ${name}.`,
        status: 400,
      }
    }
    path = path.replace(`{${name}}`, encodeURIComponent(String(value)))
  }
  const query = new URLSearchParams()
  for (const key of tool.queryParamNames) {
    appendQueryParam(query, key, args[key])
  }
  const body: Record<string, unknown> = { ...tool.adapterBody }
  for (const key of tool.bodyParamNames) {
    if (args[key] !== undefined) {
      body[key] = args[key]
    }
  }
  const sendBody =
    tool.method !== "GET" &&
    tool.method !== "HEAD" &&
    tool.bodyParamNames.length > 0
  try {
    const response = await fetchWithTimeout(
      `${OPENAI_BASE_URL()}${path}${buildQueryString(query)}`,
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
    if (!response.ok) {
      return {
        ok: false,
        message: statusMessage(response.status),
        status: response.status,
      }
    }
    if (response.status === 204) {
      return { ok: true, body: undefined }
    }
    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.includes("application/json")) {
      const text = await response.text()
      return { ok: true, body: text.length === 0 ? undefined : text }
    }
    return { ok: true, body: await response.json() }
  } catch (error) {
    if (isTransportError(error)) {
      return {
        ok: false,
        message: "ChatbotX could not be reached.",
        status: 502,
      }
    }
    logger.error(
      { err: error, tool: tool.name },
      "OpenAI profile API call failed",
    )
    return {
      ok: false,
      message: "ChatbotX returned a response that could not be read.",
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
  const problems = validateAgainstSchema(tool.inputSchema, args)
  if (problems.length > 0) {
    return errorResult(
      `Invalid arguments:\n${problems.slice(0, 10).join("\n")}`,
    )
  }

  const { _confirm, ...proposed } = args
  const mutates = !tool.annotations.readOnlyHint
  if (tool.hitlPolicy !== "none" && _confirm !== true) {
    const state = await currentState(tool, proposed, credentials)
    return errorResult(
      JSON.stringify(
        {
          code: "CONFIRMATION_REQUIRED",
          ...state,
          policy: tool.hitlPolicy,
          proposed,
          tool: tool.name,
        },
        null,
        2,
      ),
    )
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
      mutates
        ? "The action may have completed, but the response could not be returned safely. Do not repeat it automatically; check the current state."
        : "The response did not match the reviewed contract and was withheld.",
    )
  }
}
