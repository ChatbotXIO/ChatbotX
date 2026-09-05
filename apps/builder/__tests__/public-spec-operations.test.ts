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
})

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
