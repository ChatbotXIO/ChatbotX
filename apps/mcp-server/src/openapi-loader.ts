import { env } from "./env"
import { fetchWithTimeout } from "./http"
import type { TokenIntrospection } from "./token-introspection"

interface OpenAPISpec {
  paths?: Record<string, Record<string, OpenAPIOperation>>
  servers?: Array<{ url: string }>
}

interface McpOperationMeta {
  alwaysVisible?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  readOnlyHint?: boolean
  scope?: string
  visibility?: "default" | "hidden"
}

interface OpenAPIOperation {
  deprecated?: boolean
  description?: string
  operationId?: string
  parameters?: OpenAPIParameter[]
  requestBody?: {
    content?: {
      "application/json"?: {
        schema?: OpenAPISchemaObject
      }
    }
  }
  security?: Record<string, string[]>[]
  summary?: string
  tags?: string[]
  "x-mcp"?: McpOperationMeta
}

// Workspace-token security schemes only — a channel-token op (or any scheme
// this list doesn't know about) is deliberately excluded so a token type the
// MCP/CLI client doesn't hold never becomes a tool that always 401s.
const WORKSPACE_TOKEN_SECURITY_SCHEMES = new Set([
  "bearerAuth",
  "developerAccessToken",
  "tokenInSearchParams",
])

/**
 * `undefined` security means the document-level default applies (workspace
 * token, in this API) — true. An explicit `security` array is true only if
 * at least one alternative names a workspace-token scheme; `[]` (no auth) or
 * an array of non-workspace schemes (e.g. `channelApiToken`) is false.
 */
export function isWorkspaceTokenOperation(
  operation: OpenAPIOperation,
): boolean {
  if (!operation.security) {
    return true
  }

  return operation.security.some((requirement) =>
    Object.keys(requirement).some((scheme) =>
      WORKSPACE_TOKEN_SECURITY_SCHEMES.has(scheme),
    ),
  )
}

interface OpenAPIParameter {
  description?: string
  in: "path" | "query" | "header" | "cookie"
  name: string
  required?: boolean
  schema?: OpenAPISchemaObject
}

interface OpenAPISchemaObject {
  allOf?: OpenAPISchemaObject[]
  anyOf?: OpenAPISchemaObject[]
  default?: unknown
  description?: string
  enum?: unknown[]
  format?: string
  items?: OpenAPISchemaObject
  nullable?: boolean
  oneOf?: OpenAPISchemaObject[]
  properties?: Record<string, OpenAPISchemaObject>
  required?: string[]
  type?: string
}

interface DynamicToolAnnotations {
  destructiveHint: boolean
  idempotentHint: boolean
  readOnlyHint: boolean
}

export interface DynamicTool {
  alwaysVisible: boolean
  annotations: DynamicToolAnnotations
  baseUrl: string
  bodyParamNames: string[]
  description: string
  inputSchema: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
  method: string
  name: string
  pathParamNames: string[]
  pathTemplate: string
  queryParamNames: string[]
  scope?: string
  tags: string[]
  visibility: "default" | "hidden"
}

let cachedTools: DynamicTool[] | null = null

const toolsByName = new Map<string, DynamicTool>()
let cachedEtag: string | null = null
let fetchedAtMs = 0
// Coalesces concurrent refresh attempts (e.g. several `tools/list` calls
// landing after the TTL expires) onto one in-flight fetch instead of firing
// one HTTP request per caller.
let refreshInFlight: Promise<DynamicTool[]> | null = null

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"])

export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z]{2,})(?=[A-Z][a-z]|$)/g, "_$1")
    .replace(/([a-z\d])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[.\-\s]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
}

function extractPathParamNames(pathTemplate: string): string[] {
  const matches = pathTemplate.match(/\{([^}]+)\}/g)
  return matches ? matches.map((m) => m.slice(1, -1)) : []
}

/**
 * `x-mcp` hints override; otherwise inferred from the HTTP method — a GET is
 * read-only and idempotent by convention, a DELETE is destructive (and still
 * idempotent: deleting twice is a no-op), everything else (POST/PUT/PATCH)
 * defaults to none of the three.
 */
function buildAnnotations(
  method: string,
  meta: McpOperationMeta | undefined,
): DynamicToolAnnotations {
  const upperMethod = method.toUpperCase()
  return {
    readOnlyHint: meta?.readOnlyHint ?? upperMethod === "GET",
    destructiveHint: meta?.destructiveHint ?? upperMethod === "DELETE",
    idempotentHint:
      meta?.idempotentHint ??
      (upperMethod === "GET" ||
        upperMethod === "PUT" ||
        upperMethod === "DELETE"),
  }
}

/**
 * `summary` is the short, always-present label; `description` (when a route
 * sets one) carries the long-form usage guidance an agent needs to pick the
 * right tool — example payloads, valid values, edge cases. Joining both
 * (instead of preferring one) means an endpoint author never has to choose
 * which one the MCP tool actually sees.
 */
function buildToolDescription(
  operation: OpenAPIOperation,
  meta: McpOperationMeta | undefined,
  annotations: DynamicToolAnnotations,
): string {
  const parts = [operation.summary, operation.description].filter(
    (part): part is string => Boolean(part),
  )
  const requirements: string[] = []
  if (meta?.scope) {
    requirements.push(`Requires token scope: ${meta.scope}.`)
  }
  if (!annotations.readOnlyHint) {
    requirements.push("Requires a full (non read-only) token.")
  }
  if (requirements.length > 0) {
    parts.push(requirements.join("\n"))
  }

  return parts.length > 0 ? parts.join("\n\n") : (operation.operationId ?? "")
}

const resolveBodySchema = (
  bodySchema: OpenAPISchemaObject | undefined,
):
  | {
      properties: Record<string, OpenAPISchemaObject>
      required: string[]
    }
  | undefined => {
  if (!bodySchema) {
    return
  }

  if (bodySchema.properties) {
    return {
      properties: bodySchema.properties,
      required: bodySchema.required ?? [],
    }
  }

  if (bodySchema.allOf) {
    const properties: Record<string, OpenAPISchemaObject> = {}
    const required: string[] = []
    for (const branch of bodySchema.allOf) {
      for (const [key, value] of Object.entries(branch.properties ?? {})) {
        properties[key] = value
      }
      for (const key of branch.required ?? []) {
        if (!required.includes(key)) {
          required.push(key)
        }
      }
    }
    return Object.keys(properties).length > 0
      ? { properties, required }
      : undefined
  }

  const variants = [...(bodySchema.anyOf ?? []), ...(bodySchema.oneOf ?? [])]
  if (variants.length === 0) {
    return
  }

  const properties: Record<string, OpenAPISchemaObject> = {}
  for (const branch of variants) {
    for (const [key, value] of Object.entries(branch.properties ?? {})) {
      properties[key] = value
    }
  }
  // Branch requirements are intentionally omitted: per-property anyOf wrappers
  // would be more precise, but are noisier for an LLM tool schema.
  return Object.keys(properties).length > 0
    ? { properties, required: [] }
    : undefined
}

function buildInputSchema(operation: OpenAPIOperation): {
  schema: DynamicTool["inputSchema"]
  bodyParamNames: string[]
  queryParamNames: string[]
} {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  const bodyParamNames: string[] = []
  const queryParamNames: string[] = []

  for (const param of operation.parameters ?? []) {
    if (param.in !== "path" && param.in !== "query") {
      continue
    }
    const schema: Record<string, unknown> = {
      ...(param.schema ?? { type: "string" }),
    }
    if (param.description) {
      schema.description = param.description
    }
    properties[param.name] = schema
    if (param.required || param.in === "path") {
      required.push(param.name)
    }
    if (param.in === "query") {
      queryParamNames.push(param.name)
    }
  }

  const bodySchema = resolveBodySchema(
    operation.requestBody?.content?.["application/json"]?.schema,
  )
  if (bodySchema) {
    for (const [key, value] of Object.entries(bodySchema.properties)) {
      properties[key] = value
      bodyParamNames.push(key)
    }
    for (const key of bodySchema.required) {
      if (!required.includes(key)) {
        required.push(key)
      }
    }
  }

  return {
    schema: {
      type: "object",
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
    bodyParamNames,
    queryParamNames,
  }
}

function parseOperation(
  pathTemplate: string,
  method: string,
  operation: OpenAPIOperation,
  baseUrl: string,
): DynamicTool | null {
  if (
    !operation.operationId ||
    operation.deprecated ||
    !isWorkspaceTokenOperation(operation)
  ) {
    return null
  }

  const { schema, bodyParamNames, queryParamNames } =
    buildInputSchema(operation)
  const meta = operation["x-mcp"]
  const annotations = buildAnnotations(method, meta)
  return {
    alwaysVisible: meta?.alwaysVisible === true,
    annotations,
    baseUrl,
    bodyParamNames,
    description: buildToolDescription(operation, meta, annotations),
    inputSchema: schema,
    method: method.toUpperCase(),
    name: toSnakeCase(operation.operationId),
    pathParamNames: extractPathParamNames(pathTemplate),
    pathTemplate,
    queryParamNames,
    scope: meta?.scope,
    tags: operation.tags ?? [],
    visibility: meta?.visibility === "default" ? "default" : "hidden",
  }
}

function parseToolsFromSpec(spec: OpenAPISpec): DynamicTool[] {
  const baseUrl = spec.servers?.[0]?.url ?? env.CHATBOTX_API_URL
  const tools: DynamicTool[] = []

  for (const [pathTemplate, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) {
        continue
      }

      const tool = parseOperation(pathTemplate, method, operation, baseUrl)
      if (tool) {
        tools.push(tool)
      }
    }
  }

  return tools
}

/**
 * Fetches the spec with a conditional `If-None-Match` when we already hold
 * an ETag. A 304 means the previously parsed `cachedTools` are still
 * current — the response body is empty, so re-parsing isn't needed or
 * possible. `fetchedAtMs` is bumped either way so the TTL window restarts
 * from the moment freshness was confirmed, not just from the last real body
 * fetch.
 */
async function fetchAndParseSpec(): Promise<DynamicTool[]> {
  const specUrl = `${env.CHATBOTX_API_URL}/public-spec.json`

  const response = await fetchWithTimeout(
    specUrl,
    {
      headers: {
        Accept: "application/json",
        ...(cachedEtag ? { "If-None-Match": cachedEtag } : {}),
      },
    },
    env.CHATBOTX_HTTP_TIMEOUT_MS,
  )

  if (response.status === 304 && cachedTools !== null) {
    fetchedAtMs = Date.now()
    return cachedTools
  }

  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenAPI spec from ${specUrl}: ${response.status} ${response.statusText}`,
    )
  }

  const spec = (await response.json()) as OpenAPISpec
  const tools = parseToolsFromSpec(spec)

  toolsByName.clear()
  const deduplicatedTools: DynamicTool[] = []
  for (const tool of tools) {
    if (toolsByName.has(tool.name)) {
      console.error(
        `Duplicate MCP tool name "${tool.name}" in OpenAPI spec; keeping the first operation.`,
      )
      continue
    }
    toolsByName.set(tool.name, tool)
    deduplicatedTools.push(tool)
  }

  // `tools/list` serves `cachedTools` (see the return below and the 304
  // fast-path above), so it must match `toolsByName` exactly — otherwise a
  // duplicate name is advertised twice while `tools/call` can only ever
  // dispatch to the first, permanently wasting a slot in the client's
  // context window on an unreachable tool.
  cachedTools = deduplicatedTools
  cachedEtag = response.headers.get("ETag")
  fetchedAtMs = Date.now()
  // stderr keeps this out of the stdio MCP transport stream
  console.error(`Loaded ${deduplicatedTools.length} tools from OpenAPI spec`)
  return deduplicatedTools
}

export async function loadOpenApiSpec(): Promise<DynamicTool[]> {
  if (cachedTools !== null) {
    return cachedTools
  }
  return await fetchAndParseSpec()
}

/**
 * Call on every `tools/list` (cheap when fresh: one `Date.now()` comparison,
 * no network call) so a spec change on the server side — a new endpoint, a
 * renamed operation — shows up without restarting the MCP server. Concurrent
 * callers during the same stale window share one in-flight fetch. A failed
 * background refresh logs to stderr and keeps serving the last good
 * `cachedTools` rather than surfacing the error to the caller — a transient
 * API blip must not take down tool listing for every connected session.
 */
export async function refreshOpenApiSpecIfStale(): Promise<DynamicTool[]> {
  if (cachedTools === null) {
    return await loadOpenApiSpec()
  }

  const isStale = Date.now() - fetchedAtMs >= env.CHATBOTX_SPEC_TTL_MS
  if (!isStale) {
    return cachedTools
  }

  if (!refreshInFlight) {
    refreshInFlight = fetchAndParseSpec()
      .catch((error: unknown) => {
        console.error(
          `Background OpenAPI spec refresh failed, keeping previous tool list: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
        return cachedTools ?? []
      })
      .finally(() => {
        refreshInFlight = null
      })
  }

  return await refreshInFlight
}

export function getCachedTools(): DynamicTool[] {
  return cachedTools ?? []
}

export const getToolByName = (name: string): DynamicTool | undefined =>
  toolsByName.get(name)

function isVisibleForScope(
  tool: DynamicTool,
  introspection: TokenIntrospection | null,
): boolean {
  // Fail OPEN: introspection unavailable (network blip, unexpected
  // response) must not hide every tool — enforcement of scope/permission
  // still happens server-side on the actual call; this is a `tools/list`
  // display concern only.
  if (introspection === null) {
    return true
  }

  // `readOnlyHint` (method-inferred for GET, or explicit `x-mcp.readOnlyHint`
  // for a POST that's actually a read in disguise) is the single source of
  // truth here — no separate allowlist to keep in sync.
  if (
    introspection.permission === "read_only" &&
    !tool.annotations.readOnlyHint
  ) {
    return false
  }

  // `alwaysVisible` (discovery endpoints like `capabilities.get`/`token.get`)
  // and an unrestricted token (`scopes: null`) both skip the scope check.
  if (tool.alwaysVisible || introspection.scopes === null) {
    return true
  }

  return tool.scope !== undefined && introspection.scopes.includes(tool.scope)
}

/**
 * The `tools/list` surface — `visibility: "default"` operations only,
 * further narrowed to what `introspection` (the calling token's
 * permission/scopes, from `GET /v1/token`) allows when provided. Everything
 * excluded here is still reachable via `search_tools` / `call_tool` against
 * `getCachedTools()`, which is never filtered.
 */
export function getVisibleTools(
  introspection?: TokenIntrospection | null,
): DynamicTool[] {
  return getCachedTools().filter(
    (tool) =>
      tool.visibility === "default" &&
      isVisibleForScope(tool, introspection ?? null),
  )
}
