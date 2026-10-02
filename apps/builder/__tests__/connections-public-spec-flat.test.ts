// @vitest-environment node

import { OpenAPIGenerator } from "@orpc/openapi"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { beforeAll, describe, expect, test, vi } from "vitest"

// Same import-side-effect stubs as `public-spec-operations.test.ts` — this
// test only inspects generated route metadata, never calls a handler.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
  workspaceAuthorizedMidddleware: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})

type OpenApiOperation = {
  operationId?: string
  requestBody?: { content?: Record<string, { schema?: JsonSchema }> }
}

type JsonSchema = {
  properties?: Record<string, unknown>
  oneOf?: JsonSchema[]
  anyOf?: JsonSchema[]
  allOf?: JsonSchema[]
  $ref?: string
}

const CONNECTIONS_PATH_PATTERN =
  /^\/v1\/(connections|connection-providers|connect-sessions)(\/|$)/

let postOperationsUnderTest: {
  operationId: string
  method: string
  path: string
  bodySchema?: JsonSchema
}[]

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
      publicSpecGenerateOptions("connections-public-spec-flat.test"),
    ),
  )

  postOperationsUnderTest = []
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    if (!CONNECTIONS_PATH_PATTERN.test(path)) {
      continue
    }
    for (const [method, operation] of Object.entries(
      methods as Record<string, OpenApiOperation>,
    )) {
      if (!operation.operationId) {
        continue
      }
      postOperationsUnderTest.push({
        operationId: operation.operationId,
        method: method.toUpperCase(),
        path,
        bodySchema:
          operation.requestBody?.content?.["application/json"]?.schema,
      })
    }
  }
}, 120_000)

describe("public API spec — connections/connect-sessions request bodies stay MCP-flat", () => {
  test("no request body under /v1/connections*, /v1/connection-providers, or /v1/connect-sessions* uses oneOf/anyOf/allOf", () => {
    const nonFlat = postOperationsUnderTest
      .filter((op) => op.bodySchema)
      .filter((op) => {
        const schema = op.bodySchema as JsonSchema
        return Boolean(schema.oneOf || schema.anyOf || schema.allOf)
      })
      .map((op) => op.operationId)

    expect(nonFlat).toEqual([])
  })

  test("every POST body has a flat top-level `properties` object (what MCP's buildInputSchema reads)", () => {
    const missingProperties = postOperationsUnderTest
      .filter((op) => op.method === "POST" && op.bodySchema)
      .filter((op) => !(op.bodySchema as JsonSchema).properties)
      .map((op) => op.operationId)

    expect(missingProperties).toEqual([])
  })

  test("covers the expected connections + connect-sessions POST operations (sanity: the filter above is not vacuously empty)", () => {
    const postOperationIds = postOperationsUnderTest
      .filter((op) => op.method === "POST")
      .map((op) => op.operationId)
      .sort()

    expect(postOperationIds).toEqual(
      [
        "connectSessions.connectTargets",
        "connectSessions.submitInput",
        "connections.create",
        "connections.reconnect",
        "connections.refresh",
        "connections.verify",
      ].sort(),
    )
  })
})
