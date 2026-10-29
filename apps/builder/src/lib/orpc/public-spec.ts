import type { OpenAPIGenerator } from "@orpc/openapi"
import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENCY_RETENTION_HOURS,
  IDEMPOTENT_REPLAYED_HEADER,
  MAX_IDEMPOTENCY_KEY_LENGTH,
} from "../idempotency/constants"
import type { McpHitlPolicy, McpRouteMeta } from "./mcp-annotations"

type PublicSpecDocument = Awaited<
  ReturnType<InstanceType<typeof OpenAPIGenerator>["generate"]>
>

export const PUBLIC_SPEC_VERSION = "0.0.1"

export const WORKSPACE_TOKEN_SECURITY_SCHEMES = {
  bearerAuth: { type: "http", scheme: "bearer" },
  developerAccessToken: { type: "http", scheme: "bearer" },
  tokenInSearchParams: { type: "apiKey", in: "query", name: "token" },
} as const

export const CHANNEL_API_TOKEN_SCHEME = "channelApiToken"

export const PUBLIC_SECURITY_SCHEMES = {
  ...WORKSPACE_TOKEN_SECURITY_SCHEMES,
  [CHANNEL_API_TOKEN_SCHEME]: {
    type: "http",
    scheme: "bearer",
    description: "A channel API token, scoped to a single inbox.",
  },
} as const

const WORKSPACE_TOKEN_SECURITY: Record<string, string[]>[] = [
  { bearerAuth: [] },
  { developerAccessToken: [] },
  { tokenInSearchParams: [] },
]

const CHANNEL_API_TOKEN_SECURITY: Record<string, string[]>[] = [
  { [CHANNEL_API_TOKEN_SCHEME]: [] },
]

// Paths under this prefix require a channel API token, never a workspace
// token — the document-level `security` (workspace-token schemes) does not
// apply to them, so every generated spec must override `security` on these
// operations after generation (oRPC 1.14.5 has no per-operation `security`
// hook — only a document-level default via `specGenerateOptions.security`).
const CHANNEL_API_TOKEN_PATH_PREFIX = "/v1/channels/api/"

const IDEMPOTENT_METHODS = new Set(["post", "put", "patch", "delete"])

const READ_ONLY_METHODS: Record<string, true> = { get: true, head: true }
const HITL_HTTP_METHODS: Record<string, true> = {
  get: true,
  head: true,
  post: true,
  put: true,
  patch: true,
  delete: true,
}

const OUTBOUND_OPERATION_PATTERNS = [
  /^messages_create$/u,
  /(?:^|_)(?:send|schedule|resend|resume|book|block|import)(?:_|$)/u,
  /_issue_/u,
  /_trigger_/u,
  /_bulk_/u,
  /_push_/u,
  /_thread_control$/u,
  /_enable_bot$/u,
] as const

const DESTRUCTIVE_OPERATION_PATTERN =
  /(?:^|_)(?:delete|remove|reset|stop|cancel)(?:_|$)/u

type OpenApiOperation = {
  operationId?: string
  responses?: unknown
  "x-mcp"?: McpRouteMeta & { scope?: string | string[] }
}

const normalizeOperationId = (operationId: string): string =>
  operationId
    .replace(/([a-z\d])([A-Z])/gu, "$1_$2")
    .replace(/[.-]/gu, "_")
    .toLowerCase()

const inferHitlPolicy = (
  method: string,
  operationId: string | undefined,
  readOnlyHint: boolean | undefined,
): McpHitlPolicy => {
  if (READ_ONLY_METHODS[method] || readOnlyHint) {
    return "none"
  }

  const normalizedOperationId = operationId
    ? normalizeOperationId(operationId)
    : ""
  if (
    OUTBOUND_OPERATION_PATTERNS.some((pattern) =>
      pattern.test(normalizedOperationId),
    )
  ) {
    return "confirm_outbound"
  }
  if (DESTRUCTIVE_OPERATION_PATTERN.test(normalizedOperationId)) {
    return "confirm_destructive"
  }
  return "confirm_diff"
}

const IDEMPOTENCY_KEY_PARAMETER = {
  name: IDEMPOTENCY_KEY_HEADER,
  in: "header",
  required: false,
  description: `Optional client-generated key (e.g. a UUID, max ${MAX_IDEMPOTENCY_KEY_LENGTH} chars) that makes this write safe to retry. Replaying the same key on the same operation within ${IDEMPOTENCY_RETENTION_HOURS} hours returns the original 2xx response with \`${IDEMPOTENT_REPLAYED_HEADER}: true\`; reusing it with a different payload returns 422, and a key whose first request is still running returns 409. Only successful responses are stored, so a failed attempt releases the key.`,
  schema: { type: "string", maxLength: MAX_IDEMPOTENCY_KEY_LENGTH },
} as const

export function publicSpecGenerateOptions(title: string) {
  return {
    info: { title, version: PUBLIC_SPEC_VERSION },
    commonSchemas: {
      UndefinedError: { error: "UndefinedError" as const },
    },
    security: WORKSPACE_TOKEN_SECURITY,
    components: { securitySchemes: PUBLIC_SECURITY_SCHEMES },
  }
}

/**
 * Overrides `security` to the channel-token scheme for every
 * `/v1/channels/api/*` operation in a generated spec, so the document is
 * honest about which token type each operation actually requires (the
 * default `security` supplied by `publicSpecGenerateOptions` only covers
 * workspace-token schemes).
 */
export function withChannelApiTokenSecurity(spec: PublicSpecDocument) {
  if (!spec.paths) {
    return spec
  }

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    if (!(pathItem && path.startsWith(CHANNEL_API_TOKEN_PATH_PREFIX))) {
      continue
    }

    for (const operation of Object.values(pathItem)) {
      if (
        operation &&
        typeof operation === "object" &&
        "responses" in operation
      ) {
        ;(operation as { security?: unknown }).security =
          CHANNEL_API_TOKEN_SECURITY
      }
    }
  }

  return spec
}

/**
 * Stamps every public operation with the MCP human-in-the-loop policy. A route
 * may explicitly override the inferred policy through `mcpSpec`, but a write
 * never silently becomes unguarded when a new public procedure is added.
 */
export function withMcpHitlPolicy(spec: PublicSpecDocument) {
  if (!spec.paths) {
    return spec
  }

  for (const pathItem of Object.values(spec.paths)) {
    if (!pathItem) {
      continue
    }

    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HITL_HTTP_METHODS[method]) {
        continue
      }
      if (
        !(
          operation &&
          typeof operation === "object" &&
          "responses" in operation
        )
      ) {
        continue
      }

      const operationWithMcp = operation as OpenApiOperation
      const existing = operationWithMcp["x-mcp"]
      const hitlPolicy =
        existing?.hitlPolicy ??
        inferHitlPolicy(
          method,
          operationWithMcp.operationId,
          existing?.readOnlyHint,
        )
      operationWithMcp["x-mcp"] = {
        ...existing,
        ...(hitlPolicy === "confirm_destructive" &&
        existing?.destructiveHint === undefined
          ? { destructiveHint: true }
          : {}),
        hitlPolicy,
      }
    }
  }

  return spec
}

/**
 * Adds the optional retry key only to write operations. oRPC 1.14.5 has no
 * method-aware operation hook, so this runs after the document is generated.
 */
export function withIdempotencyKeyHeader(spec: PublicSpecDocument) {
  if (!spec.paths) {
    return spec
  }

  for (const pathItem of Object.values(spec.paths)) {
    if (!pathItem) {
      continue
    }

    for (const [method, operation] of Object.entries(pathItem)) {
      if (!IDEMPOTENT_METHODS.has(method)) {
        continue
      }
      if (!(operation && typeof operation === "object")) {
        continue
      }

      const operationWithParameters = operation as { parameters?: unknown[] }
      const parameters = operationWithParameters.parameters ?? []
      const hasIdempotencyKey = parameters.some(
        (parameter) =>
          parameter !== null &&
          typeof parameter === "object" &&
          "name" in parameter &&
          parameter.name === IDEMPOTENCY_KEY_PARAMETER.name,
      )
      if (!hasIdempotencyKey) {
        operationWithParameters.parameters = [
          ...parameters,
          IDEMPOTENCY_KEY_PARAMETER,
        ]
      }
    }
  }

  return spec
}
