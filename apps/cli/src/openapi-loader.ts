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
const ACTION_SUBPATHS = new Set(["block", "unblock", "reset", "reindex"])
// Singleton resources — GET on the collection returns a single object, use "get" not "list"
// One per workspace: `GET /v1/shopify` (and `/v1/woocommerce`) reads the
// connection, not a list.
const SINGLETON_RESOURCES = new Set([
  "workspaces",
  "response-sla",
  "shopify",
  "woocommerce",
])
// Two-segment singleton resources that have a read AND a write route on the
// same path (`GET`/`PATCH /v1/workspace/settings`): the method picks the verb,
// otherwise both would derive the same command name and one would be dropped.
const METHOD_VERBED_SINGLETON_PATHS = new Set([
  "workspace/settings",
  "messenger/templates/{id}",
  "products/meta-catalog",
  "ecommerce/settings",
  // GET and PUT would both derive `translation:settings` and one would be dropped.
  "translation/settings",
])
// Collections under a resource that take both a list (GET) and a create (POST)
// on the same path, which the generic naming would collapse into one command.
const METHOD_VERBED_COLLECTION_PATHS = new Set(["products/imports"])
const SINGLETON_VERBS: Record<string, string> = {
  get: "get",
  delete: "delete",
  post: "create",
  put: "update",
  patch: "update",
}
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

/**
 * Explicit names for operations the generic derivation below would collapse
 * onto a sibling's command. A collision silently drops one operation, and for
 * `DELETE .../custom-fields` it left `contacts custom-field delete` clearing
 * every custom field instead of one — so each colliding operation gets its own
 * unambiguous verb here. Keyed by `METHOD path`.
 */
const COMMAND_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  // Verbs on the conversation's translation, not sub-resources to "add"
  // (they would derive the unhelpful `conversations:request:add` / `:preview:add`).
  "POST /v1/conversations/{conversationId}/translation/requests":
    "conversations:translation:request",
  "POST /v1/conversations/{conversationId}/translation/preview":
    "conversations:translation:preview",
  "DELETE /v1/contacts/{identifier}/custom-fields":
    "contacts:clear-all-custom-fields",
  "PUT /v1/contacts/{identifier}/custom-fields/{idOrName}":
    "contacts:set-custom-field",
  "PUT /v1/bot-fields/{idOrName}": "bot-fields:set",
  "PATCH /v1/messenger-channels/{id}/settings":
    "messenger-channels:settings:edit",
  "PATCH /v1/instagram-channels/{id}/settings":
    "instagram-channels:settings:edit",
  "PATCH /v1/inboxes/{inboxId}/ai-handover/settings": "inboxes:settings:edit",
  "PATCH /v1/bot-fields/{idOrName}": "bot-fields:edit",
  // Same path as GET/PUT/DELETE `integrations:find-by-ai`; without this the
  // PATCH would be silently dropped as a duplicate command name.
  "PATCH /v1/integrations/ai/{provider}": "integrations:update-ai",
  "DELETE /v1/analytics/flows/{flowId}/stats": "analytics:reset-flow-stats",
  "POST /v1/decision-connections/{id}/test": "decision-connections:test",
  // Derives to `whatsapp-channels:sync:add`, the name of
  // `POST /v1/whatsapp-channels/{id}/templates/sync`; without this one of the
  // two would be silently dropped.
  "POST /v1/whatsapp-channels/{id}/routing-roles/sync":
    "whatsapp-channels:routing-roles:sync",
  "POST /v1/ads/campaigns": "ads:create-campaign",
  "POST /v1/ads/conversion-rules": "ads:create-conversion-rule",
  "PATCH /v1/ads/conversion-rules/{id}": "ads:update-conversion-rule",
  "DELETE /v1/ads/conversion-rules/{id}": "ads:delete-conversion-rule",
  "POST /v1/mini-apps/{id}/publish-whatsapp": "mini-apps:publish-whatsapp",
  "GET /v1/mini-apps/{id}/flow-json": "mini-apps:flow-json",
  "POST /v1/mini-apps/{id}/duplicate": "mini-apps:duplicate",
  "POST /v1/mini-apps/{id}/whatsapp-draft": "mini-apps:whatsapp-draft:push",
  "POST /v1/mini-apps/{id}/whatsapp-draft/publish":
    "mini-apps:whatsapp-draft:publish",
  "GET /v1/mini-apps/{id}/whatsapp-preview": "mini-apps:whatsapp-preview",
  "GET /v1/conversations/{conversationId}/messages/{messageId}/flow-response":
    "conversations:flow-response:get",
  // Pipeline actions are verbs on the pipeline or item, not sub-resources to "add".
  "POST /v1/pipelines/{id}/duplicate": "pipelines:duplicate",
  "POST /v1/pipelines/{id}/stages/reorder": "pipelines:stages:reorder",
  "POST /v1/pipelines/{id}/items/{itemId}/move": "pipelines:item:move",
  "POST /v1/pipelines/{id}/items/{itemId}/transfer": "pipelines:item:transfer",
  "GET /v1/pipelines/{id}/stats": "pipelines:stats",
  "GET /v1/pipelines/{id}/stage-totals": "pipelines:stage-totals",
  // Template share/analytics/retry are verbs on the template or install.
  "GET /v1/templates/{id}/link": "templates:link",
  "PUT /v1/templates/{id}/share": "templates:share",
  "POST /v1/templates/{id}/share/rotate": "templates:rotate-share",
  "GET /v1/templates/{id}/analytics": "templates:analytics",
  "GET /v1/templates/{id}/installers": "templates:installers",
  "GET /v1/templates/{id}/installers/{installerId}/uninstall-preview":
    "templates:uninstall-preview",
  "POST /v1/templates/{id}/installers/{installerId}/uninstall":
    "templates:uninstall-installer",
  "GET /v1/template-installations/{id}/uninstall-preview":
    "template-installations:uninstall-preview",
  "POST /v1/template-installations/{id}/uninstall":
    "template-installations:uninstall",
  "POST /v1/template-installations/{id}/uninstall/cancel":
    "template-installations:cancel-uninstall",
  "POST /v1/template-installations/{id}/retry": "template-installations:retry",
  "POST /v1/template-installations/{id}/sync": "template-installations:sync",
  "GET /v1/template-installations/{id}/syncs": "template-installations:syncs",
  "GET /v1/template-installations/{id}/syncs/{syncId}":
    "template-installations:sync-detail",
  "POST /v1/template-installations/{id}/backups/{backupId}/restore":
    "template-installations:restore-backup",
  // Order status moves are verbs on the order, not sub-resources to "add".
  "POST /v1/orders/{id}/accept": "orders:accept",
  "POST /v1/orders/{id}/ship": "orders:ship",
  "POST /v1/orders/{id}/conclude": "orders:conclude",
  "POST /v1/orders/{id}/cancel": "orders:cancel",
  // Cancelling a contact sync run is a verb on the run, not a sub-resource.
  "POST /v1/contact-syncs/{runId}/cancel": "contact-syncs:cancel",
  "GET /v1/marketing-messages/campaigns": "marketing-messages:list-campaigns",
  "POST /v1/marketing-messages/campaigns": "marketing-messages:create-campaign",
  "GET /v1/marketing-messages/campaigns/{id}":
    "marketing-messages:get-campaign",
  "PUT /v1/marketing-messages/campaigns/{id}":
    "marketing-messages:update-campaign",
  "DELETE /v1/marketing-messages/campaigns/{id}":
    "marketing-messages:delete-campaign",
  "GET /v1/marketing-messages/audiences": "marketing-messages:list-audiences",
  "POST /v1/marketing-messages/audiences": "marketing-messages:create-audience",
  "DELETE /v1/marketing-messages/audiences/{id}":
    "marketing-messages:delete-audience",
  // Managed channel posts live under /management, so the generic rule would
  // name the GET and PATCH on `/management/{id}` the same.
  "GET /v1/channel-posts/management": "channel-posts:list-managed",
  "GET /v1/channel-posts/management/{id}": "channel-posts:get-managed",
  "PATCH /v1/channel-posts/management/{id}": "channel-posts:update-managed",
  "POST /v1/channel-posts/management/bulk-update":
    "channel-posts:bulk-update-managed",
  "POST /v1/channel-posts/management/{id}/refresh":
    "channel-posts:refresh-managed",
  "POST /v1/channel-posts/management/refresh-metrics":
    "channel-posts:refresh-metrics",
  "GET /v1/channel-posts/management/authors": "channel-posts:list-authors",
  "GET /v1/channel-posts/management/{id}/metrics": "channel-posts:get-metrics",
  "GET /v1/post-analytics/summary": "post-analytics:summary",
  "GET /v1/post-analytics/timeseries": "post-analytics:timeseries",
  "GET /v1/post-analytics/top-posts": "post-analytics:top-posts",
  "GET /v1/post-analytics/best-times": "post-analytics:best-times",
  "GET /v1/posts/{id}/metrics": "social-posts:get-metrics",
  "GET /v1/channel-posts/management/{id}/comments":
    "channel-posts:list-comments",
  "POST /v1/channel-posts/management/merge-view":
    "channel-posts:merge-comments",
  "POST /v1/channel-posts/management/{id}/comments/{commentId}/like":
    "channel-posts:like-comment",
  "DELETE /v1/channel-posts/management/{id}/comments/{commentId}":
    "channel-posts:delete-comment",
  "POST /v1/channel-posts/management/export": "channel-posts:export-comments",
  "POST /v1/channel-posts/management/exports":
    "channel-posts:start-comment-export",
  "GET /v1/channel-posts/management/exports/{fileId}":
    "channel-posts:get-comment-export",
  "POST /v1/channel-posts/sync": "channel-posts:sync",
  "GET /v1/channel-posts/sync/status": "channel-posts:sync-status",
  // Posts composed in ChatbotX for the connected social accounts.
  "POST /v1/posts": "social-posts:create",
  "GET /v1/posts": "social-posts:list",
  "POST /v1/posts/validate": "social-posts:validate",
  "POST /v1/posts/preview": "social-posts:preview",
  "GET /v1/posts/content-types": "social-posts:content-types",
  "GET /v1/posts/counts": "social-posts:counts",
  "GET /v1/posts/{id}": "social-posts:get",
  "PATCH /v1/posts/{id}": "social-posts:update",
  "DELETE /v1/posts/{id}": "social-posts:delete",
  "POST /v1/posts/{id}/duplicate": "social-posts:duplicate",
  "POST /v1/posts/{id}/publish": "social-posts:publish",
  "POST /v1/posts/{id}/reschedule": "social-posts:reschedule",
  "POST /v1/posts/{id}/unschedule": "social-posts:unschedule",
  "PUT /v1/posts/{id}/recurrence": "social-posts:set-recurrence",
  "DELETE /v1/posts/{id}/recurrence": "social-posts:end-recurrence",
  "POST /v1/posts/{id}/recurrence/pause": "social-posts:pause-recurrence",
  "POST /v1/posts/{id}/recurrence/resume": "social-posts:resume-recurrence",
  "GET /v1/posts/{id}/recurrence/occurrences": "social-posts:list-occurrences",
  "POST /v1/posts/{id}/recurrence/occurrences/skip":
    "social-posts:skip-occurrences",
  "POST /v1/posts/{id}/recurrence/occurrences/restore":
    "social-posts:restore-occurrences",
  "POST /v1/posts/{id}/targets/{targetId}/retry": "social-posts:retry-target",
  "POST /v1/posts/{id}/targets/{targetId}/resolve":
    "social-posts:resolve-target",
  "POST /v1/posts/{id}/targets/{targetId}/remove": "social-posts:remove-target",
  // Suggested post text; a static path, so the generic rule would name it after
  // the `ai` segment.
  "POST /v1/posts/ai/generate": "social-posts:write-with-ai",
  // Social accounts are the logins a workspace publishes through, separate
  // from the inbox channels.
  "GET /v1/social-accounts": "social-accounts:list",
  "GET /v1/social-accounts/{id}": "social-accounts:get",
  "POST /v1/social-accounts/{id}/verify": "social-accounts:verify",
  "POST /v1/social-accounts/{id}/sync-destinations":
    "social-accounts:sync-destinations",
  "DELETE /v1/social-accounts/{id}": "social-accounts:disconnect",
  // Where a post can be published (a connected inbox or a TikTok login); a
  // static path under `/v1/posts`, so the generic rule would name it `posts:destinations`.
  "GET /v1/posts/destinations": "post-destinations:list",
  "GET /v1/posts/destinations/{id}": "post-destinations:get",
  "POST /v1/posts/destinations/recheck-permissions":
    "post-destinations:recheck-permissions",
  // A destination's posting times (its queue): one schedule per destination,
  // so the read is a `get`, not a `list`.
  "GET /v1/posts/destinations/{id}/posting-schedule":
    "post-destinations:posting-schedule:get",
  "PUT /v1/posts/destinations/{id}/posting-schedule":
    "post-destinations:posting-schedule:update",
  "GET /v1/posts/destinations/{id}/free-slots":
    "post-destinations:free-slots:list",
  "GET /v1/posts/destinations/{id}/publishing-settings":
    "post-destinations:publishing-settings:get",
  // Feed auto-posting: the actions on one feed are verbs, not sub-resources.
  "POST /v1/post-feeds/bulk-delete": "post-feeds:bulk-delete",
  "POST /v1/post-feeds/{id}/pause": "post-feeds:pause",
  "POST /v1/post-feeds/{id}/resume": "post-feeds:resume",
  "POST /v1/post-feeds/{id}/check": "post-feeds:check",
  "GET /v1/post-feeds/{id}/items": "post-feeds:list-items",
  "POST /v1/post-feeds/{id}/test": "post-feeds:test",
  "GET /v1/post-feeds/{id}/items/{itemId}/draft-content":
    "post-feeds:item-draft-content",
}

export function pathAndMethodToCommandName(
  pathTemplate: string,
  method: string,
): string {
  const override =
    COMMAND_NAME_OVERRIDES[`${method.toUpperCase()} ${pathTemplate}`]
  if (override) {
    return override
  }
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

  if (!secondIsParam && METHOD_VERBED_SINGLETON_PATHS.has(normalized)) {
    const verb = segments[2] && m === "get" ? "get" : (SINGLETON_VERBS[m] ?? m)
    return `${group}:${segments[1]}:${verb}`
  }

  if (!secondIsParam && METHOD_VERBED_COLLECTION_PATHS.has(normalized)) {
    const verb = m === "get" ? "list" : (SINGLETON_VERBS[m] ?? m)
    return `${group}:${segments[1]}:${verb}`
  }

  if (!secondIsParam) {
    // Filter/variant on collection: /v1/integrations/status/token-errors or /v1/tags/name/{name}
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
      // Names are re-derived on every load so a cache written by an older CLI
      // picks up naming changes (e.g. COMMAND_NAME_OVERRIDES) immediately.
      return cached.map((tool) => ({
        ...tool,
        commandName: pathAndMethodToCommandName(tool.pathTemplate, tool.method),
      }))
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
