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
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(
      methods as Record<string, unknown>,
    )) {
      const op = operation as {
        operationId?: string
        summary?: string
        tags?: string[]
        security?: Record<string, string[]>[]
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
    }
  }

  operations.sort((a, b) => a.operationId.localeCompare(b.operationId))
}, 120_000)

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

  test("integrations.list, webhooks.list, and keywords.list responses never widen to include workspaceId", () => {
    for (const operationId of [
      "integrations.list",
      "webhooks.list",
      "keywords.list",
    ]) {
      const responseSchema = responseSchemasByOperationId[operationId]
      expect(responseSchema, `${operationId} response schema`).toBeDefined()

      const keys = new Set<string>()
      collectSchemaPropertyKeys(
        responseSchema,
        componentSchemas,
        keys,
        new Set(),
      )

      expect(keys.has("workspaceId")).toBe(false)
    }
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
