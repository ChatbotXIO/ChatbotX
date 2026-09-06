import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

interface OpenAPISpec {
  paths?: Record<string, Record<string, OpenAPIOperation>>
  servers?: Array<{ url: string }>
}

interface OpenAPIOperation {
  deprecated?: boolean
  description?: string
  operationId?: string
  parameters?: OpenAPIParameter[]
  requestBody?: {
    required?: boolean
    content?: {
      "application/json"?: {
        schema?: OpenAPISchemaObject
      }
    }
  }
  security?: Record<string, string[]>[]
  summary?: string
}

// Workspace-token security schemes only — a channel-token op (or any scheme
// this list doesn't know about) is deliberately excluded so a token type the
// CLI client doesn't hold never becomes a command that always 401s.
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

export interface DynamicTool {
  baseUrl: string
  bodyParamNames: string[]
  commandName: string
  description: string
  inputSchema: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
  method: string
  pathParamNames: string[]
  pathTemplate: string
  queryParamNames: string[]
}

interface SpecCache {
  fetchedAt: number
  tools: DynamicTool[]
  url: string
}

const CACHE_DIR = join(homedir(), ".chatbotX")
const CACHE_FILE = join(CACHE_DIR, "openapi-cache.json")
const DEFAULT_TTL_SECONDS = 3600

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"])

const POST_VERB_OVERRIDES: Record<string, string> = {
  message: "send",
}

// Sub-paths that are actions themselves (not nouns), collapse to group:action (2-level)
const ACTION_SUBPATHS = new Set(["block", "unblock"])
// Singleton resources — GET on the collection returns a single object, use "get" not "list"
const SINGLETON_RESOURCES = new Set(["workspaces"])
const V1_PREFIX_RE = /^\/v1\//
const LEADING_SLASH_RE = /^\//

function getTtlSeconds(): number {
  const raw = process.env.CHATBOTX_SPEC_CACHE_TTL_SECONDS
  if (!raw) {
    return DEFAULT_TTL_SECONDS
  }
  const parsed = Number.parseInt(raw, 10)
  return Number.isNaN(parsed) ? DEFAULT_TTL_SECONDS : parsed
}

function readCache(specUrl: string): DynamicTool[] | null {
  try {
    const raw = readFileSync(CACHE_FILE, "utf8")
    const cache = JSON.parse(raw) as SpecCache
    if (cache.url !== specUrl) {
      return null
    }
    const ageSeconds = (Date.now() - cache.fetchedAt) / 1000
    if (ageSeconds > getTtlSeconds()) {
      return null
    }
    return cache.tools
  } catch {
    return null
  }
}

function writeCache(specUrl: string, tools: DynamicTool[]): void {
  try {
    mkdirSync(CACHE_DIR, { recursive: true })
    const cache: SpecCache = { url: specUrl, fetchedAt: Date.now(), tools }
    writeFileSync(CACHE_FILE, JSON.stringify(cache), "utf8")
  } catch {
    // Cache write failure is non-fatal
  }
}

function extractPathParamNames(pathTemplate: string): string[] {
  const matches = pathTemplate.match(/\{([^}]+)\}/g)
  return matches ? matches.map((m) => m.slice(1, -1)) : []
}

export function pathAndMethodToCommandName(
  pathTemplate: string,
  method: string,
): string {
  const normalized = pathTemplate
    .replace(V1_PREFIX_RE, "")
    .replace(LEADING_SLASH_RE, "")
  const segments = normalized.split("/")
  const group = segments[0]
  const m = method.toLowerCase()

  if (segments.length === 1) {
    const actions: Record<string, string> = {
      get: SINGLETON_RESOURCES.has(group) ? "get" : "list",
      post: "create",
      put: "update",
      patch: "update",
      delete: "delete",
    }
    return `${group}:${actions[m] ?? m}`
  }

  const secondIsParam = segments[1].startsWith("{")

  if (!secondIsParam) {
    // Filter/variant on collection: /v1/contacts/find-by-custom-field or /v1/tags/name/{name}
    const nonParamTail = segments.slice(1).filter((s) => !s.startsWith("{"))
    const isLastParam = segments.at(-1)?.startsWith("{") ?? false
    const action = nonParamTail.join("-")
    return `${group}:${isLastParam ? `find-by-${action}` : action}`
  }

  const remainingAfterResource = segments.slice(2)

  if (remainingAfterResource.length === 0) {
    const actions: Record<string, string> = {
      get: "get",
      put: "update",
      patch: "update",
      delete: "delete",
      post: "create",
    }
    return `${group}:${actions[m] ?? m}`
  }

  const nonParamRemainder = remainingAfterResource.filter(
    (s) => !s.startsWith("{"),
  )
  const subResource = nonParamRemainder.at(-1)
  const isLastRemainderParam =
    remainingAfterResource.at(-1)?.startsWith("{") ?? false
  const singular = subResource?.endsWith("s")
    ? subResource.slice(0, -1)
    : subResource

  if (m === "get") {
    const sub = isLastRemainderParam ? singular : subResource
    const verb = isLastRemainderParam ? "get" : "list"
    return `${group}:${sub}:${verb}`
  }
  if (m === "post") {
    if (ACTION_SUBPATHS.has(subResource ?? "")) {
      return `${group}:${subResource}`
    }
    const verb = POST_VERB_OVERRIDES[singular ?? ""] ?? "add"
    return `${group}:${singular}:${verb}`
  }
  if (m === "delete") {
    return `${group}:${singular}:delete`
  }
  if (m === "put" || m === "patch") {
    return `${group}:${subResource}:update`
  }
  return `${group}:${subResource}:${m}`
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

  const bodySchema =
    operation.requestBody?.content?.["application/json"]?.schema
  if (bodySchema?.properties) {
    for (const [key, value] of Object.entries(bodySchema.properties)) {
      properties[key] = value
      bodyParamNames.push(key)
    }
    for (const key of bodySchema.required ?? []) {
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

export async function loadOpenApiSpecForCli(
  apiUrl: string,
  forceRefresh = false,
): Promise<DynamicTool[]> {
  const specUrl = `${apiUrl}/public-spec.json`

  if (!forceRefresh) {
    const cached = readCache(specUrl)
    if (cached) {
      return cached
    }
  }

  const response = await fetch(specUrl, {
    headers: { Accept: "application/json" },
  })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch OpenAPI spec from ${specUrl}: ${response.status} ${response.statusText}`,
    )
  }

  const spec = (await response.json()) as OpenAPISpec
  const baseUrl = spec.servers?.[0]?.url ?? apiUrl
  const tools: DynamicTool[] = []

  for (const [pathTemplate, pathItem] of Object.entries(spec.paths ?? {})) {
    for (const [httpMethod, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(httpMethod)) {
        continue
      }
      if (!operation.operationId) {
        continue
      }
      if (operation.deprecated) {
        continue
      }
      if (!isWorkspaceTokenOperation(operation)) {
        continue
      }

      const pathParamNames = extractPathParamNames(pathTemplate)
      const { schema, bodyParamNames, queryParamNames } =
        buildInputSchema(operation)

      tools.push({
        commandName: pathAndMethodToCommandName(pathTemplate, httpMethod),
        description:
          operation.summary ?? operation.description ?? operation.operationId,
        inputSchema: schema,
        baseUrl,
        pathTemplate,
        method: httpMethod.toUpperCase(),
        pathParamNames,
        bodyParamNames,
        queryParamNames,
      })
    }
  }

  writeCache(specUrl, tools)
  return tools
}
