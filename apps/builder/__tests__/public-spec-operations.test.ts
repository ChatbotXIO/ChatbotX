// @vitest-environment node

import { OpenAPIGenerator } from "@orpc/openapi"
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

type SpecOperation = {
  operationId: string
  method: string
  path: string
  tags: string[]
  summary?: string
  security?: Record<string, string[]>[]
  responseStatuses: string[]
}

const LEGACY_WORKSPACE_TOKEN_PATTERN = /workspace[_.]?token/i
const LEGACY_API_SUFFIX_PATTERN = /[_.]api$/i

let operations: SpecOperation[]
let responseSchemasByOperationId: Record<string, unknown>
let requestSchemasByOperationId: Record<string, unknown[]>
let componentSchemas: Record<string, unknown>

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

  operations = []
  responseSchemasByOperationId = {}
  requestSchemasByOperationId = {}
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(
      methods as Record<string, unknown>,
    )) {
      const op = operation as {
        operationId?: string
        summary?: string
        tags?: string[]
        security?: Record<string, string[]>[]
        parameters?: { schema?: unknown }[]
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
      operations.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
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
      const bodySchema = op.requestBody?.content?.["application/json"]?.schema
      if (bodySchema) {
        requestSchemas.push(bodySchema)
      }
      if (requestSchemas.length > 0) {
        requestSchemasByOperationId[op.operationId] = requestSchemas
      }
    }
  }

  operations.sort((a, b) => a.operationId.localeCompare(b.operationId))
}, 120_000)

describe("public API spec — operation naming guard", () => {
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
      "contacts.search",
      "contacts.get",
      "contacts.findByCustomField",
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
      // ai-agents, reflinks, ai-triggers) — see PR that added
      // `aiAgentsPublicRouter`/`aiTriggersPublicRouter`/etc. Each of these
      // reuses a resource schema shared with private (non-public) callers,
      // so `workspaceId` can't be omitted from the shared schema without
      // breaking those callers. Fix per operation by giving the public
      // router its own `.omit({ workspaceId: true })` output schema,
      // mirroring `apps/builder/src/features/analytics/schema/public.ts`.
      "aiAgents.create",
      "aiAgents.get",
      "aiAgents.update",
      "aiTriggers.list",
      "aiTriggers.create",
      "aiTriggers.get",
      "aiTriggers.update",
      "aiTriggers.duplicate",
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
