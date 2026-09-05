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
}

const LEGACY_WORKSPACE_TOKEN_PATTERN = /workspace[_.]?token/i
const LEGACY_API_SUFFIX_PATTERN = /[_.]api$/i

let operations: SpecOperation[]

beforeAll(async () => {
  const { publicRouter } = await import("@/routers/public")

  const generator = new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
  })

  const spec = await generator.generate(publicRouter, {
    info: { title: "public-spec-operations.test", version: "0.0.1" },
  })

  operations = []
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(
      methods as Record<string, unknown>,
    )) {
      const op = operation as {
        operationId?: string
        summary?: string
        tags?: string[]
      }
      if (!op.operationId) {
        continue
      }
      operations.push({
        operationId: op.operationId,
        method: method.toUpperCase(),
        path,
        tags: op.tags ?? [],
      })
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

  test("every operation has a summary", async () => {
    const { publicRouter } = await import("@/routers/public")
    const generator = new OpenAPIGenerator({
      schemaConverters: [new ZodToJsonSchemaConverter()],
    })
    const spec = await generator.generate(publicRouter, {
      info: { title: "public-spec-operations.test", version: "0.0.1" },
    })

    const missingSummary: string[] = []
    for (const methods of Object.values(spec.paths ?? {})) {
      for (const operation of Object.values(
        methods as Record<string, unknown>,
      )) {
        const op = operation as { operationId?: string; summary?: string }
        if (op.operationId && !op.summary) {
          missingSummary.push(op.operationId)
        }
      }
    }

    expect(missingSummary).toEqual([])
  })
})
