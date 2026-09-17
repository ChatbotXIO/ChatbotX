// @vitest-environment node

import {
  type JSONSchema,
  OpenAPIGenerator,
  simplifyComposedObjectJsonSchemasAndRefs,
} from "@orpc/openapi"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { beforeAll, describe, expect, test, vi } from "vitest"

// `@/routers/public` transitively imports every feature's `api/public.ts`,
// which pulls in `@chatbotx.io/database/client` (opens a real `pg.Pool` at
// module load) via feature `queries`/`actions` modules, and `@/orpc`'s
// `authorizedAPI` chain, which boots the full better-auth stack via
// `@/middlewares/auth`. Neither is reachable from this test (it only
// inspects generated route metadata, never calls a handler), so both are
// stubbed to keep the import side-effect-free — mirrors the precedent in
// workspace-token-scope-enforcement.test.ts and
// broadcasts-workspace-token-scope.test.ts.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
  workspaceAuthorizedMidddleware: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})

type JsonSchema = {
  allOf?: JsonSchema[]
  anyOf?: JsonSchema[]
  description?: string
  oneOf?: JsonSchema[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  type?: string
}

type SpecOperation = {
  bodySchema?: JsonSchema
  description?: string
  method: string
  operationId: string
  parameters: Array<{
    description?: string
    name: string
    schema?: JsonSchema
  }>
  path: string
  responseStatuses: string[]
  security?: Record<string, string[]>[]
  summary?: string
  tags: string[]
}

const LEGACY_WORKSPACE_TOKEN_PATTERN = /workspace[_.]?token/i
const LEGACY_API_SUFFIX_PATTERN = /[_.]api$/i

let operations: SpecOperation[]
let responseSchemasByOperationId: Record<string, unknown>
let requestSchemasByOperationId: Record<string, unknown[]>
let componentSchemas: Record<string, unknown>
let specDocument: unknown

// Recursively collects every property key across a JSON schema, including
// through $ref (resolved against `components.schemas`), allOf/oneOf/anyOf,
// and array items — a top-level "no workspaceId" check would miss it if the
// converter nested the field inside a $ref or a combinator.
function collectSchemaPropertyKeys(
  schema: unknown,
  components: Record<string, unknown>,
  keys: Set<string>,
  seenRefs: Set<string>,
): void {
  if (!schema || typeof schema !== "object") {
    return
  }

  const node = schema as Record<string, unknown>

  if (typeof node.$ref === "string") {
    if (seenRefs.has(node.$ref)) {
      return
    }
    seenRefs.add(node.$ref)
    const refName = node.$ref.split("/").pop()
    const resolved = refName ? components[refName] : undefined
    collectSchemaPropertyKeys(resolved, components, keys, seenRefs)
    return
  }

  if (node.properties && typeof node.properties === "object") {
    for (const [key, value] of Object.entries(
      node.properties as Record<string, unknown>,
    )) {
      keys.add(key)
      collectSchemaPropertyKeys(value, components, keys, seenRefs)
    }
  }

  for (const combinator of ["allOf", "oneOf", "anyOf"] as const) {
    const branches = node[combinator]
    if (Array.isArray(branches)) {
      for (const branch of branches) {
        collectSchemaPropertyKeys(branch, components, keys, seenRefs)
      }
    }
  }

  if (node.items) {
    collectSchemaPropertyKeys(node.items, components, keys, seenRefs)
  }
}

const PRODUCT_NAME_PATTERN = /chatbotx/i

// Collects every human-readable copy string (`summary`/`description`) in the
// generated document, including schema field descriptions from zod
// `.describe()`. Deliberately key-scoped: `chatbotx` is a legitimate
// ChannelType enum member (packages/database/src/partials/integration.ts), so
// a document-wide string match would be a false positive.
function collectCopyStrings(
  node: unknown,
  path: string,
  found: Array<{ path: string; text: string }>,
): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => {
      collectCopyStrings(item, `${path}[${index}]`, found)
    })
    return
  }
  if (!node || typeof node !== "object") {
    return
  }
  for (const [key, value] of Object.entries(node)) {
    if (
      (key === "summary" || key === "description") &&
      typeof value === "string"
    ) {
      found.push({ path: `${path}.${key}`, text: value })
      continue
    }
    collectCopyStrings(value, `${path}.${key}`, found)
  }
}

beforeAll(async () => {
  const { publicRouter } = await import("@/routers/public")
  const { publicSpecGenerateOptions, withChannelApiTokenSecurity } =
    await import("@/lib/orpc/public-spec")

  const generator = new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
  })

  const spec = withChannelApiTokenSecurity(
    await generator.generate(
      publicRouter,
      publicSpecGenerateOptions("public-spec-operations.test"),
    ),
  )

  componentSchemas = (spec.components?.schemas ?? {}) as Record<string, unknown>
  specDocument = spec

  operations = []
  responseSchemasByOperationId = {}
  requestSchemasByOperationId = {}
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(
      methods as Record<string, unknown>,
    )) {
      const op = operation as {
        description?: string
        operationId?: string
        summary?: string
        tags?: string[]
        security?: Record<string, string[]>[]
        parameters?: Array<{
          description?: string
          name: string
          schema?: JsonSchema
        }>
        requestBody?: {
          content?: Record<string, { schema?: unknown }>
        }
        responses?: Record<
          string,
          { content?: Record<string, { schema?: unknown }> }
        >
      }
      if (!op.operationId) {
        continue
      }
      const bodySchema = op.requestBody?.content?.["application/json"]?.schema
      operations.push({
        bodySchema: bodySchema
          ? (simplifyComposedObjectJsonSchemasAndRefs(
              bodySchema as JSONSchema,
              spec,
            ) as JsonSchema)
          : undefined,
        description: op.description,
        operationId: op.operationId,
        method: method.toUpperCase(),
        parameters: op.parameters ?? [],
        path,
        tags: op.tags ?? [],
        summary: op.summary,
        security: op.security,
        responseStatuses: Object.keys(op.responses ?? {}),
      })

      const successResponse = Object.entries(op.responses ?? {}).find(
        ([status]) => status.startsWith("2"),
      )?.[1]
      const responseSchema =
        successResponse?.content?.["application/json"]?.schema
      if (responseSchema) {
        responseSchemasByOperationId[op.operationId] = responseSchema
      }

      const requestSchemas: unknown[] = []
      for (const param of op.parameters ?? []) {
        if (param.schema) {
          requestSchemas.push(param.schema)
        }
      }
      const requestBodySchema =
        op.requestBody?.content?.["application/json"]?.schema
      if (requestBodySchema) {
        requestSchemas.push(requestBodySchema)
      }
      if (requestSchemas.length > 0) {
        requestSchemasByOperationId[op.operationId] = requestSchemas
      }
    }
  }

  operations.sort((a, b) => a.operationId.localeCompare(b.operationId))
}, 120_000)

const NON_ALPHANUMERIC_PATTERN = /[^a-z0-9]+/
const SUMMARY_STARTS_UPPERCASE_PATTERN = /^[A-Z]/

// Public API summaries are article-free imperative phrases: no `a`/`an`/`the`,
// no possessive `'s`, and no `by id`/`by identifier` suffix (the path already
// says how the resource is addressed). `by name` stays legal — it is what
// distinguishes `contacts.addTagsByName` from `contacts.addTags`.
const SUMMARY_ARTICLE_PATTERN = /\b(?:an?|the)\b/i
const SUMMARY_POSSESSIVE_PATTERN = /'s\b/
const SUMMARY_BY_ID_PATTERN = /\bby (?:id|identifier)\b/i
const normalizeDescriptionPhrase = (value: string): string => {
  const [firstToken = "", ...remainingTokens] = value
    .toLowerCase()
    .split(NON_ALPHANUMERIC_PATTERN)
    .filter(Boolean)
  const normalizedFirstToken = firstToken.endsWith("s")
    ? firstToken.slice(0, -1)
    : firstToken
  return [normalizedFirstToken, ...remainingTokens].join("")
}

const hasDescribedComposedBranches = (schema: JsonSchema): boolean =>
  (["allOf", "anyOf", "oneOf"] as const).some((combinator) => {
    const branches = schema[combinator]
    return (
      branches !== undefined &&
      branches.length > 0 &&
      branches.every((branch) => Boolean(branch.description))
    )
  })

const PATH_PARAM_ID_SUFFIX_PATTERN = /^[a-z][A-Za-z0-9]*Id$/
const PATH_PARAM_SHAPE_PATTERN = /^[a-z][A-Za-z0-9]*$/
const TRAILING_PATH_PARAM_PATTERN = /\{[^}]+\}$/

describe("public API spec — operation naming guard", () => {
  // Pins the MCP tool name / operationId surface. A diff here is a
  // deliberate, breaking rename of the public API surface — update the
  // snapshot only when that rename is intentional.
  test("operation list (operationId, method, path) matches the committed snapshot", () => {
    expect(
      operations.map(({ operationId, method, path }) => ({
        operationId,
        method,
        path,
      })),
    ).toMatchSnapshot()
  })

  test("every operationId is resource.verb — never the legacy workspace-token/api suffix", () => {
    for (const { operationId } of operations) {
      expect(operationId).not.toMatch(LEGACY_WORKSPACE_TOKEN_PATTERN)
      expect(operationId).not.toMatch(LEGACY_API_SUFFIX_PATTERN)
    }
  })

  test("every operation has a summary", () => {
    const missingSummary = operations
      .filter((op) => !op.summary)
      .map((op) => op.operationId)

    expect(missingSummary).toEqual([])
  })

  test("every operation has a description", () => {
    const missingDescriptions = operations
      .filter((operation) => !operation.description)
      .map((operation) => operation.operationId)

    expect(missingDescriptions).toEqual([])
  })

  test("every operation has a tag", () => {
    const missingTags = operations
      .filter((operation) => operation.tags.length === 0)
      .map((operation) => operation.operationId)

    expect(missingTags).toEqual([])
  })

  test("every summary follows the public API house style", () => {
    const invalidSummaries = operations.flatMap((operation) => {
      const summary = operation.summary
      if (!summary) {
        return operation.operationId
      }

      const isInvalid =
        summary.length > 60 ||
        summary.endsWith(".") ||
        summary.includes(" — ") ||
        summary.includes(". ") ||
        !SUMMARY_STARTS_UPPERCASE_PATTERN.test(summary) ||
        SUMMARY_ARTICLE_PATTERN.test(summary) ||
        SUMMARY_POSSESSIVE_PATTERN.test(summary) ||
        SUMMARY_BY_ID_PATTERN.test(summary)
      return isInvalid ? operation.operationId : []
    })

    expect(invalidSummaries).toEqual([])
  })

  test("every present description is useful and non-redundant", () => {
    const invalidDescriptions = operations.flatMap((operation) => {
      const description = operation.description
      if (!description) {
        return []
      }

      const duplicatesSummary = normalizeDescriptionPhrase(
        description,
      ).startsWith(normalizeDescriptionPhrase(operation.summary ?? ""))
      const isInvalid = description.length < 50 || duplicatesSummary
      return isInvalid ? operation.operationId : []
    })
    expect(invalidDescriptions).toEqual([])
  })

  test("every top-level input field has a description", () => {
    const missingInputDescriptions = operations.flatMap((operation) => {
      const missingParameters = operation.parameters
        .filter(
          (parameter) =>
            !(parameter.description || parameter.schema?.description),
        )
        .map((parameter) => `${operation.operationId}.${parameter.name}`)

      const bodySchema = operation.bodySchema
      if (!bodySchema) {
        return missingParameters
      }
      if (bodySchema.type !== "object") {
        return [...missingParameters, `${operation.operationId}.<body>`]
      }

      const missingBodyFields = Object.entries(bodySchema.properties ?? {})
        .filter(
          ([, property]) =>
            !(property.description || hasDescribedComposedBranches(property)),
        )
        .map(([name]) => `${operation.operationId}.${name}`)

      return [...missingParameters, ...missingBodyFields]
    })

    expect(missingInputDescriptions).toEqual([])
  })

  test("every /v1/channels/api/* operation requires only the channel token scheme", () => {
    const channelOps = operations.filter((op) =>
      op.path.startsWith("/v1/channels/api/"),
    )

    expect(channelOps.length).toBeGreaterThan(0)
    for (const op of channelOps) {
      expect(op.security).toEqual([{ channelApiToken: [] }])
    }
  })

  test("every non-channel operation requires only workspace-token schemes", () => {
    const nonChannelOps = operations.filter(
      (op) => !op.path.startsWith("/v1/channels/api/"),
    )

    expect(nonChannelOps.length).toBeGreaterThan(0)
    for (const op of nonChannelOps) {
      expect(op.security).toBeUndefined()
    }
  })

  test("no public operation response schema leaks workspaceId", () => {
    // Add a commented, explicit exception list here ONLY if you find a
    // legitimate need after auditing all operations — do not add exceptions
    // preemptively.
    const ALLOWED_WORKSPACE_ID_OPERATIONS = new Set<string>([
      // `channels.me` legitimately echoes the authenticated token's own
      // workspace/inbox identity — that IS the endpoint's purpose.
      "channels.me",
      // `token.get` legitimately echoes the calling token's own workspace
      // id, permission, and scopes — that IS the endpoint's purpose (token
      // introspection), same rationale as `channels.me`.
      "token.get",

      // Pre-existing leaks, confirmed present on `main` before the analytics
      // router this test was strengthened for (verified via a clean
      // `main` worktree — none of these are touched by that change).
      // Each response schema below includes `workspaceId` somewhere in its
      // shape (often via a shared internal row schema reused as-is for the
      // public response). This is a real minor information leak (the
      // workspace's own id, not another tenant's), not a cross-tenant
      // authorization bug, but it should still be cleaned up — tracked as
      // follow-up work, out of scope for the analytics router PR that
      // tightened this test from a 3-operation allow-list to a full sweep.
      // Fix per operation by `.omit({ workspaceId: true })`-ing the
      // offending row schema in that feature's `schema/public.ts`, mirroring
      // how `apps/builder/src/features/analytics/schema/public.ts` does it.
      "aiAgents.list",
      "contacts.list",
      "contacts.create",
      "contacts.get",
      "contacts.upsert",
      "contacts.listMessages",
      "contacts.getMessage",
      "contacts.refreshProfile",
      "conversations.list",
      "coupons.listTopics",
      "coupons.createTopic",
      "coupons.getTopic",
      "coupons.updateTopic",
      "coupons.deleteTopic",
      "coupons.archiveTopic",
      "coupons.unarchiveTopic",
      "coupons.listCoupons",
      "coupons.issueCoupon",
      "coupons.markCouponUsed",
      "errorLogs.list",
      "folders.list",
      "folders.create",
      "folders.update",
      "inboxTeams.list",
      "products.list",
      "products.create",
      "products.get",
      "reflinks.get",
      "savedReplies.list",
      "sequences.list",
      "sequences.get",
      "triggers.list",
      "webhooks.create",
      "workspaceMembers.list",
      "workspaceMembers.get",

      // Same pre-existing-shared-resource-schema leak pattern as above,
      // introduced by the automation public API (flows, triggers, keywords,
      // ai-agents, ai-mcp-servers, ai-functions, ai-files, reflinks) — each
      // of these reuses a resource schema shared with private (non-public)
      // callers, so `workspaceId` can't be omitted from the shared schema
      // without breaking those callers. Fix per operation by giving the
      // public router its own `.omit({ workspaceId: true })` output schema,
      // mirroring `apps/builder/src/features/analytics/schema/public.ts`.
      "aiAgents.create",
      "aiAgents.get",
      "aiAgents.update",
      "aiMcpServers.list",
      "aiMcpServers.create",
      "aiMcpServers.get",
      "aiMcpServers.update",
      "aiFunctions.list",
      "aiFunctions.create",
      "aiFunctions.get",
      "aiFunctions.update",
      "aiFiles.list",
      "aiFiles.create",
      "aiFiles.get",
      "flows.get",
      "flows.versions",
      "reflinks.list",
      "reflinks.create",
      "reflinks.update",
      "triggers.create",
      "triggers.get",
      "triggers.update",
      "triggers.updateSettings",

      // Same pre-existing-shared-resource-schema leak pattern as above,
      // introduced by completing the `inbox` scope's public surface (see
      // the "Scope notes" section in docs/developer/workspace-api-tokens.md).
      // `conversations.get` reuses `listConversationsItemResource`, the same
      // shared shape `conversations.list` already leaks through above.
      // `inboxTeams.*`/`savedReplies.*` reuse `inboxTeamResource`/
      // `savedReplyResource`, the same shapes `inboxTeams.list`/
      // `savedReplies.list` already leak through above. `messages.*` reuses
      // `messageResourceWithRelations`, shared with the private message API
      // and with the already-public `contacts.listMessages`/`getMessage`.
      "conversations.get",
      "inboxTeams.create",
      "inboxTeams.get",
      "inboxTeams.update",
      "inboxTeams.addMembers",
      "inboxTeams.removeMembers",
      "messages.list",
      "messages.create",
      "messages.get",
      "savedReplies.create",
      "savedReplies.get",
      "savedReplies.update",
    ])

    const leaking = Object.entries(responseSchemasByOperationId)
      .filter(
        ([operationId]) => !ALLOWED_WORKSPACE_ID_OPERATIONS.has(operationId),
      )
      .filter(([, schema]) => {
        const keys = new Set<string>()
        collectSchemaPropertyKeys(schema, componentSchemas, keys, new Set())
        return keys.has("workspaceId")
      })
      .map(([operationId]) => operationId)

    expect(leaking).toEqual([])
  })

  test("no public operation request schema accepts a client-supplied workspaceId", () => {
    // A route that *accepts* workspaceId is the actual cross-tenant vector —
    // strictly worse than echoing one back in a response. Every
    // `schema/public.ts` is expected to `.omit({ workspaceId: true })`; this
    // is a full sweep, not a spot-check, so it should never need exceptions.
    const leaking = Object.entries(requestSchemasByOperationId)
      .filter(([, schemas]) =>
        schemas.some((schema) => {
          const keys = new Set<string>()
          collectSchemaPropertyKeys(schema, componentSchemas, keys, new Set())
          return keys.has("workspaceId")
        }),
      )
      .map(([operationId]) => operationId)

    expect(leaking).toEqual([])
  })

  // A path parameter name must say what it addresses. `id`/`idOrName` for
  // the operation's own resource, `identifier` for the flexible
  // id/email/phone contact address, a handful of domain nouns that are
  // resources in their own right (`channel`, `provider`, `worksheetName`),
  // or `<noun>Id` for a parent/related resource addressed by a different
  // noun than the operation's own (e.g. `conversationId` on a message
  // route). `operationId` is banned outright: it collides with the
  // OpenAPI/MCP/CLI concept those same tools use to name the operation
  // itself, which is exactly how `ads.retryCampaign` et al. used to read as
  // "retry the operation-id" instead of "retry the messaging ad".
  const ALLOWED_BARE_PATH_PARAM_NAMES = new Set([
    "channel",
    "id",
    "identifier",
    "idOrName",
    "provider",
    "worksheetName",
  ])

  test("every path parameter name says what it addresses", () => {
    const invalidPathParams = operations.flatMap((operation) => {
      const names = operation.parameters
        .filter((parameter) => operation.path.includes(`{${parameter.name}}`))
        .map((parameter) => parameter.name)

      return names
        .filter(
          (name) =>
            name === "operationId" ||
            !PATH_PARAM_SHAPE_PATTERN.test(name) ||
            !(
              ALLOWED_BARE_PATH_PARAM_NAMES.has(name) ||
              PATH_PARAM_ID_SUFFIX_PATTERN.test(name)
            ),
        )
        .map((name) => `${operation.operationId}.${name}`)
    })

    expect(invalidPathParams).toEqual([])
  })

  // House rule (docs/developer/workspace-api-tokens.md): PUT replaces a
  // resource wholesale (body has required fields — omitting one would leave
  // the resource in an undefined state), PATCH merges a partial change
  // (every body field optional). Scoped to routes whose last path segment
  // is the resource's own id/name placeholder — a sub-resource setter like
  // `/{id}/enabled` or a collection route like `/v1/bot-fields` doesn't
  // address "the whole resource" the same way, so the rule doesn't apply
  // there; both are already excluded by the trailing-path-param check.

  test("every PUT/PATCH addressing a resource by its trailing path id matches its body's required-ness", () => {
    const resourceAddressedMutations = operations.filter(
      (op) =>
        (op.method === "PUT" || op.method === "PATCH") &&
        TRAILING_PATH_PARAM_PATTERN.test(op.path),
    )

    expect(resourceAddressedMutations.length).toBeGreaterThan(0)

    const mismatched = resourceAddressedMutations
      .filter((op) => {
        const hasRequiredBodyField = (op.bodySchema?.required?.length ?? 0) > 0
        return op.method === "PATCH"
          ? hasRequiredBodyField
          : !hasRequiredBodyField
      })
      .map((op) => op.operationId)

    expect(mismatched).toEqual([])
  })
})

describe("public API spec — white-label safety", () => {
  // White-label deployments serve this document to their own customers under
  // their own brand (the tenant name supplies `info.title` in
  // apps/builder/src/app/api/public-spec.json/route.ts). Copy that hardcodes
  // the product name cannot be rebranded and leaks through the Scalar docs,
  // the CLI, and every generated MCP tool description.
  test("no summary or description hardcodes the product name", () => {
    const found: Array<{ path: string; text: string }> = []
    collectCopyStrings(specDocument, "$", found)

    expect(found.filter(({ text }) => PRODUCT_NAME_PATTERN.test(text))).toEqual(
      [],
    )
  })
})

const PATH_PARAM_PATTERN = /\{[^}]+\}/

describe("public API spec — error response coverage", () => {
  const COMMON_ERROR_STATUSES = ["400", "401", "403", "429", "500"]

  // `channels.me` has no `.input()` and no possible business-logic failure —
  // it echoes the authenticated token's identity — so it legitimately has no
  // 400 (business error) or 422 (validation error) case.
  const NO_400_OPERATION_IDS = new Set(["channels.me"])

  test("every operation documents the shared 400/401/403/429/500 errors", () => {
    const missing = operations
      .filter((op) => !NO_400_OPERATION_IDS.has(op.operationId))
      .filter((op) =>
        COMMON_ERROR_STATUSES.some(
          (status) => !op.responseStatuses.includes(status),
        ),
      )
      .map((op) => op.operationId)

    expect(missing).toEqual([])
  })

  test("every DELETE, PUT/PATCH, and GET-by-id operation documents 404", () => {
    const shouldDocument404 = operations.filter(
      (op) =>
        op.method === "DELETE" ||
        op.method === "PUT" ||
        op.method === "PATCH" ||
        (op.method === "GET" && PATH_PARAM_PATTERN.test(op.path)),
    )

    expect(shouldDocument404.length).toBeGreaterThan(0)

    const missing404 = shouldDocument404
      .filter((op) => !op.responseStatuses.includes("404"))
      .map((op) => op.operationId)

    expect(missing404).toEqual([])
  })

  // A route with no `.output(...)` schema serializes to this exact
  // "unknown value" JSON Schema shape (oRPC/Zod's representation of `any`),
  // distinct from every real response schema (which always declares a type
  // or a real union of typed alternatives).
  const isUndeclaredBodySchema = (schema: unknown): boolean =>
    JSON.stringify(schema) === JSON.stringify({ anyOf: [{}, { not: {} }] })

  test("every operation with no declared response body documents successStatus: 204", () => {
    const bodyless = operations.filter((op) =>
      isUndeclaredBodySchema(responseSchemasByOperationId[op.operationId]),
    )

    expect(bodyless.length).toBeGreaterThan(0)

    const wrongStatus = bodyless
      .filter((op) => {
        const successStatuses = op.responseStatuses.filter((status) =>
          status.startsWith("2"),
        )
        return !(successStatuses.length === 1 && successStatuses[0] === "204")
      })
      .map((op) => op.operationId)

    expect(wrongStatus).toEqual([])
  })

  // Mirrors `toSnakeCase` in apps/mcp-server/src/openapi-loader.ts — kept in
  // sync manually rather than imported, since apps/builder has no dependency
  // on chatbotx-mcp-server. If that implementation changes, update this too.
  const toSnakeCase = (str: string): string =>
    str
      .replace(/([A-Z]{2,})(?=[A-Z][a-z]|$)/g, "_$1")
      .replace(/([a-z\d])([A-Z])/g, "$1_$2")
      .toLowerCase()
      .replace(/[.\-\s]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")

  test("operationIds are injective after MCP's snake_case conversion — a collision leaves one tool permanently unreachable", () => {
    const snakeCased = operations.map((op) => toSnakeCase(op.operationId))
    const seen = new Map<string, string[]>()
    for (const [index, name] of snakeCased.entries()) {
      const operationId = operations[index]?.operationId ?? ""
      const existing = seen.get(name)
      if (existing) {
        existing.push(operationId)
      } else {
        seen.set(name, [operationId])
      }
    }

    const collisions = [...seen.entries()].filter(
      ([, operationIds]) => operationIds.length > 1,
    )

    expect(collisions).toEqual([])
    expect(new Set(snakeCased).size).toBe(operations.length)
  })

  test("every POST/PUT/PATCH operation documents 422", () => {
    const bodyMethods = operations.filter(
      (op) =>
        op.method === "POST" || op.method === "PUT" || op.method === "PATCH",
    )

    expect(bodyMethods.length).toBeGreaterThan(0)

    const missing422 = bodyMethods
      .filter((op) => !op.responseStatuses.includes("422"))
      .map((op) => op.operationId)

    expect(missing422).toEqual([])
  })

  // oRPC only maps non-path input into query parameters for GET
  // (@orpc/openapi's `OpenAPIGenerator`); every other method — including
  // DELETE — gets a `requestBody`. The MCP/CLI clients used to silently
  // drop the body on DELETE (`NO_BODY_METHODS` in
  // `execute-tool.ts`/`dynamic-executor.ts` included DELETE), which made
  // any DELETE operation with declared body fields permanently
  // uncallable — or, for a field with a default, silently unoverridable —
  // through either client even though its schema advertised it. That is
  // fixed now, but a DELETE route should still only carry a body when it
  // genuinely needs one to address or disambiguate the resource — pin the
  // exact set so a new one is a deliberate, reviewed addition, not a
  // silent trap for callers of a client that regresses this fix.
  //
  // `contacts.removeTags` (`tagIds`), `contacts.unsubscribeSequences`
  // (`sequenceIds`), and `inboxTeams.removeMembers` (`userIds`) each remove
  // a caller-chosen subset of a collection. `keywords.delete` (`type`,
  // defaulted to "inbound") and `messages.delete` (`createdAt`, required to
  // locate a message in sharded storage — the comment in
  // `messages/schema/public.ts` claiming DELETE maps this to a query
  // parameter was wrong for this oRPC version) turned up only once this
  // guard's filter ran against the real generated spec, which is exactly
  // the "signal" this guard exists to catch: both were silently broken (or
  // silently limited to the default) by the same dropped-DELETE-body bug
  // this change fixes.
  test("DELETE operations with a request body are exactly the reviewed set", () => {
    const deletesWithBody = operations
      .filter((op) => op.method === "DELETE" && op.bodySchema)
      .map((op) => op.operationId)
      .sort()

    expect(deletesWithBody).toEqual([
      "contacts.removeTags",
      "contacts.unsubscribeSequences",
      "inboxTeams.removeMembers",
      "keywords.delete",
      "messages.delete",
    ])
  })
})

/**
 * The spec assertions above check only that a *status code* slot exists. That
 * cannot catch the failure this suite actually exists to prevent: a route
 * throwing an `ORPCError` whose `code` no route declares. oRPC does not fail
 * loudly there — `validateORPCError` looks the code up in the route's error
 * map and, on a miss, passes the error through with `defined: false`, so it
 * silently leaves the OpenAPI contract while still returning a status. These
 * tests read each procedure's real `errorMap` instead of the rendered spec.
 */
describe("public API spec — declared codes match what the mapper throws", () => {
  // Every code `mapKnownOrpcErrors`/`toKnownOrpcError` (`@/orpc`) or the shared
  // auth + rate-limit middlewares can throw on ANY public route, regardless of
  // that route's own resource shape. Each must come from `commonApiErrors`.
  const UNIVERSAL_CODES = [
    "UNAUTHORIZED",
    "INVALID_CHATBOT_TOKEN",
    "FORBIDDEN",
    "trialExpired",
    "macLimitReached",
    // Thrown by oRPC's own input-schema rejection, remapped from the raw
    // `BAD_REQUEST` — so it applies to every route with an `.input()`.
    "invalidRequestData",
    // Thrown by `validationException` in @chatbotx.io/business.
    "validation",
    "tooManyRequests",
    "INTERNAL_SERVER_ERROR",
  ]

  type ProcedureErrorMap = { path: string; codes: string[] }

  function collectErrorMaps(
    node: unknown,
    path: string[],
    out: ProcedureErrorMap[],
  ): void {
    if (!node || typeof node !== "object") {
      return
    }
    const def = (node as Record<string, { errorMap?: object }>)["~orpc"]
    if (def?.errorMap) {
      out.push({ path: path.join("."), codes: Object.keys(def.errorMap) })
      return
    }
    for (const [key, child] of Object.entries(node)) {
      collectErrorMaps(child, [...path, key], out)
    }
  }

  let procedures: ProcedureErrorMap[]

  beforeAll(async () => {
    const { publicRouter } = await import("@/routers/public")
    procedures = []
    collectErrorMaps(publicRouter, [], procedures)
  })

  test("every public procedure declares the universal error codes", () => {
    expect(procedures.length).toBeGreaterThan(0)

    const missing = procedures
      .map((proc) => ({
        path: proc.path,
        absent: UNIVERSAL_CODES.filter((code) => !proc.codes.includes(code)),
      }))
      .filter((entry) => entry.absent.length > 0)

    expect(missing).toEqual([])
  })

  test("no procedure re-declares a code commonApiErrors already provides", async () => {
    const { commonApiErrors, possibleErrorsOnFindingResource } = await import(
      "@/lib/orpc/orpc-error-helper"
    )
    const shared = new Set(Object.keys(commonApiErrors))

    // Sanity-check the sets really are disjoint at the source, so a future
    // edit that moves a code back into a per-router set fails here first.
    for (const code of Object.keys(possibleErrorsOnFindingResource)) {
      expect(shared.has(code)).toBe(false)
    }

    // Each procedure's codes = commonApiErrors + its own set, with no overlap,
    // so the total is exactly the sum. A duplicate would shrink the key count.
    const duplicated = procedures.filter(
      (proc) => new Set(proc.codes).size !== proc.codes.length,
    )
    expect(duplicated).toEqual([])
  })
})
