// @vitest-environment node

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { OpenAPIGenerator } from "@orpc/openapi"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { beforeAll, describe, expect, test, vi } from "vitest"
import { WORKSPACE_TOKEN_SECURITY_SCHEMES } from "@/lib/orpc/public-spec"

// Same side-effect-free import stubs as public-spec-operations.test.ts —
// `@/routers/public` transitively boots the real db client and better-auth
// stack, neither of which this test (route metadata only) ever calls.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
  workspaceAuthorizedMidddleware: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})

type McpOperationMeta = {
  visibility?: "default" | "hidden"
  alwaysVisible?: boolean
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  scope?: string
}

type McpSpecOperation = {
  operationId: string
  method: string
  path: string
  summary?: string
  description?: string
  security?: Record<string, string[]>[]
  "x-mcp"?: McpOperationMeta
}

// Every operation whose security includes a workspace-token scheme (i.e.
// `isWorkspaceTokenOperation` in `apps/mcp-server/src/openapi-loader.ts`
// would return true for it) must carry `x-mcp.scope` — that's the signal
// `oo.spec`-wrapping `requireTokenScope` in `apps/builder/src/orpc.ts`
// actually ran. A channel-token-only or unauthenticated operation is exempt:
// it never becomes an MCP tool, so it never needs a scope.
const workspaceTokenSecuritySchemeNames = new Set(
  Object.keys(WORKSPACE_TOKEN_SECURITY_SCHEMES),
)

function isWorkspaceTokenOperation(operation: McpSpecOperation): boolean {
  if (!operation.security) {
    return true
  }
  return operation.security.some((requirement) =>
    Object.keys(requirement).some((scheme) =>
      workspaceTokenSecuritySchemeNames.has(scheme),
    ),
  )
}

// Guard against the default set silently growing back toward 346 — a
// deliberate cap, not a tuned performance number. Bump only alongside an
// explicit decision to add a tool to the default set (see the plan's P0.2
// table), never as a side effect of an unrelated change.
const MAX_DEFAULT_VISIBLE_OPERATIONS = 45

const MCP_SERVER_ROOT = join(import.meta.dirname, "..", "..", "mcp-server")
const MCP_README_PATH = join(MCP_SERVER_ROOT, "README.md")
const MCP_README_TOOLS_HEADING = "## Available tools"
const MCP_README_PREREQUISITES_HEADING = "## Prerequisites"

function sectionBetween(
  source: string,
  startHeading: string,
  endHeading: string,
): string {
  const start = source.indexOf(startHeading)
  const end = source.indexOf(endHeading, start + startHeading.length)
  if (start === -1 || end === -1) {
    throw new Error(
      `Could not find documentation section between "${startHeading}" and "${endHeading}".`,
    )
  }
  return source.slice(start, end)
}
function mcpToolNamesFromMarkdownTable(
  source: string,
  toolColumnIndex: number,
): Set<string> {
  const toolNames = new Set<string>()
  for (const row of source.split("\n")) {
    const cell = row.split("|")[toolColumnIndex]
    if (!cell) {
      continue
    }
    for (const match of cell.matchAll(/`([^`]+)`/g)) {
      toolNames.add(match[1].replace(/[._]/g, "").toLowerCase())
    }
  }
  return toolNames
}

let operations: McpSpecOperation[]

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
      publicSpecGenerateOptions("public-spec-mcp.test"),
    ),
  )

  operations = []
  for (const [path, methods] of Object.entries(spec.paths ?? {})) {
    for (const [method, operation] of Object.entries(
      methods as Record<string, unknown>,
    )) {
      const op = operation as McpSpecOperation
      if (!op.operationId) {
        continue
      }
      operations.push({ ...op, method: method.toUpperCase(), path })
    }
  }

  operations.sort((a, b) => a.operationId.localeCompare(b.operationId))
}, 120_000)

describe("x-mcp.scope coverage", () => {
  test("every workspace-token operation carries x-mcp.scope", () => {
    const missingScope = operations
      .filter(isWorkspaceTokenOperation)
      .filter((op) => !op["x-mcp"]?.scope)
      .map((op) => op.operationId)

    expect(missingScope).toEqual([])
  })
})

describe("default tool set", () => {
  const defaultOperations = () =>
    operations.filter((op) => op["x-mcp"]?.visibility === "default")

  test(`has at most ${MAX_DEFAULT_VISIBLE_OPERATIONS} operations`, () => {
    expect(defaultOperations().length).toBeLessThanOrEqual(
      MAX_DEFAULT_VISIBLE_OPERATIONS,
    )
  })

  test("contains no DELETE operation", () => {
    const deleteDefaults = defaultOperations()
      .filter((op) => op.method === "DELETE")
      .map((op) => op.operationId)

    expect(deleteDefaults).toEqual([])
  })

  test("every default operation has a useful MCP description", () => {
    const invalidDescriptions = defaultOperations().flatMap((operation) => {
      const description = operation.description
      if (!description || description.length < 80) {
        return operation.operationId
      }

      const referencedOperationIds = [
        ...description.matchAll(/\b[a-z][A-Za-z]+\.[a-z][A-Za-z]+\b/g),
      ].map(([operationId]) => operationId)
      return referencedOperationIds.some(
        (operationId) => operationId !== operation.operationId,
      )
        ? []
        : operation.operationId
    })

    expect(invalidDescriptions).toEqual([])
  })

  test("README lists exactly the default MCP tools", () => {
    const defaultToolNames = new Set(
      defaultOperations().map((operation) =>
        operation.operationId.replace(/[._]/g, "").toLowerCase(),
      ),
    )
    const documentedToolNames = mcpToolNamesFromMarkdownTable(
      sectionBetween(
        readFileSync(MCP_README_PATH, "utf8"),
        MCP_README_TOOLS_HEADING,
        MCP_README_PREREQUISITES_HEADING,
      ),
      1,
    )

    expect({
      documentedButNotDefault: [...documentedToolNames]
        .filter((toolName) => !defaultToolNames.has(toolName))
        .sort(),
      defaultButNotDocumented: [...defaultToolNames]
        .filter((toolName) => !documentedToolNames.has(toolName))
        .sort(),
    }).toEqual({
      documentedButNotDefault: [],
      defaultButNotDocumented: [],
    })
  })

  // A diff here means the default surface changed — intentional per P0.2's
  // curated table, never a byproduct of an unrelated route edit. Update the
  // snapshot only alongside a deliberate addition/removal.
  test("operation ids match the curated snapshot", () => {
    expect(
      defaultOperations()
        .map((op) => op.operationId)
        .sort(),
    ).toMatchSnapshot()
  })
})
