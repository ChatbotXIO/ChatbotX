// @vitest-environment node

import { readFileSync } from "node:fs"
import { join } from "node:path"

import { OpenAPIGenerator } from "@orpc/openapi"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { beforeAll, describe, expect, test, vi } from "vitest"
import {
  inferHitlPolicy,
  WORKSPACE_TOKEN_SECURITY_SCHEMES,
  withIdempotencyKeyHeader,
  withMcpHitlPolicy,
} from "@/lib/orpc/public-spec"

// Same side-effect-free import stubs as public-spec-operations.test.ts —
// `@/routers/public` transitively boots the real db client and better-auth
// stack, neither of which this test (route metadata only) ever calls.
vi.mock("@/middlewares/auth", () => ({
  authMiddleware: vi.fn(),
  workspaceAuthorizedMidddleware: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy, sql: proxy }
})

type McpOperationMeta = {
  visibility?: "default" | "hidden"
  alwaysVisible?: boolean
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  hitlPolicy?:
    | "none"
    | "confirm_diff"
    | "confirm_destructive"
    | "confirm_outbound"
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

// POST-only computations explicitly documented as side-effect free. Each must
// remain an intentional exception rather than becoming an accidental policy
// hole when metadata changes.
const HITL_NONE_WRITE_ALLOWLIST: Record<string, true> = {
  "aiFiles.search": true,
  "broadcasts.previewRecurrence": true,
  "contacts.search": true,
  "flows.validate": true,
  "inboundWebhooks.previewMapping": true,
  "miniApps.validate": true,
}

// Guard against the default set silently growing back toward 346 — a
// deliberate cap, not a tuned performance number. Bump only alongside an
// explicit decision to add a tool to the default set (see the plan's P0.2
// table), never as a side effect of an unrelated change. Bumped 45 -> 48 when
// `connections.list`/`connections.create`/`connectionProviders.list`/
// `connectSessions.get`/`connectSessions.connectTargets` joined the default
// set so an agent can guide a user through connecting a new channel or
// integration without a `search_tools` round trip. Bumped 48 -> 52 when
// `pipelines.list`/`pipelines.listItems`/`pipelines.createItem`/
// `pipelines.moveItem` joined the default set so an agent can drive a CRM
// board without a `search_tools` round trip.
const MAX_DEFAULT_VISIBLE_OPERATIONS = 52

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
  const {
    publicSpecGenerateOptions,
    withChannelApiTokenSecurity,
    withMcpHitlPolicy,
  } = await import("@/lib/orpc/public-spec")

  const generator = new OpenAPIGenerator({
    schemaConverters: [new ZodToJsonSchemaConverter()],
  })

  const spec = withMcpHitlPolicy(
    withChannelApiTokenSecurity(
      await generator.generate(
        publicRouter,
        publicSpecGenerateOptions("public-spec-mcp.test"),
      ),
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

describe("inferHitlPolicy", () => {
  test.each([
    ["post", "contacts.unblock", "confirm_diff"],
    ["post", "broadcasts.unschedule", "confirm_diff"],
    ["post", "flows.publish", "confirm_outbound"],
    ["post", "contacts.bulkDelete", "confirm_destructive"],
    ["post", "contacts.bulkAddTags", "confirm_diff"],
    ["post", "contacts.import", "confirm_diff"],
    ["post", "messengerChannels.updateHandoverResumeFlow", "confirm_diff"],
    ["post", "broadcasts.resume", "confirm_outbound"],
    ["post", "connections.disconnect", "confirm_destructive"],
    ["post", "contacts.clearCustomFields", "confirm_destructive"],
    ["post", "conversations.archive", "confirm_destructive"],
    ["post", "conversations.unarchive", "confirm_diff"],
    ["post", "contacts.bulkSubscribeSequences", "confirm_outbound"],
  ] as const)("%s %s -> %s", (method, operationId, expected) => {
    expect(inferHitlPolicy(method, operationId, undefined)).toBe(expected)
  })

  test("keeps reads and read-only writes unguarded", () => {
    expect(inferHitlPolicy("get", "contacts.delete", undefined)).toBe("none")
    expect(inferHitlPolicy("post", "files.search", true)).toBe("none")
  })
})

describe("x-mcp.scope coverage", () => {
  test("every workspace-token operation carries x-mcp.scope", () => {
    const missingScope = operations
      .filter(isWorkspaceTokenOperation)
      .filter((op) => !op["x-mcp"]?.scope)
      .map((op) => op.operationId)

    expect(missingScope).toEqual([])
  })
})

describe("x-mcp HITL policy coverage", () => {
  test("guards every workspace-token write and marks destructive writes", () => {
    const unguardedWrites = operations
      .filter(isWorkspaceTokenOperation)
      .filter((operation) => !["GET", "HEAD"].includes(operation.method))
      .filter(
        (operation) =>
          !operation["x-mcp"]?.hitlPolicy ||
          operation["x-mcp"]?.hitlPolicy === "none",
      )
      .filter(
        (operation) =>
          operation["x-mcp"]?.hitlPolicy !== "none" ||
          !HITL_NONE_WRITE_ALLOWLIST[operation.operationId],
      )
      .map((operation) => operation.operationId)

    const explicitNoneWrites = operations
      .filter(isWorkspaceTokenOperation)
      .filter((operation) => !["GET", "HEAD"].includes(operation.method))
      .filter((operation) => operation["x-mcp"]?.hitlPolicy === "none")
      .map((operation) => operation.operationId)
      .sort()

    const unmarkedDestructiveWrites = operations
      .filter(
        (operation) =>
          operation["x-mcp"]?.hitlPolicy === "confirm_destructive" &&
          operation["x-mcp"]?.destructiveHint !== true,
      )
      .map((operation) => operation.operationId)

    expect({
      explicitNoneWrites,
      unguardedWrites,
      unmarkedDestructiveWrites,
    }).toEqual({
      explicitNoneWrites: Object.keys(HITL_NONE_WRITE_ALLOWLIST).sort(),
      unguardedWrites: [],
      unmarkedDestructiveWrites: [],
    })
  })
})

describe("x-mcp outbound policy", () => {
  test("classifies a contact send as outbound", () => {
    const operation = operations.find(
      (candidate) => candidate.operationId === "contacts.sendMessage",
    )

    expect(operation?.["x-mcp"]?.hitlPolicy).toBe("confirm_outbound")
  })

  test("pins the complete outbound operation set", () => {
    const outboundOperationIds = operations
      .filter(
        (operation) => operation["x-mcp"]?.hitlPolicy === "confirm_outbound",
      )
      .map((operation) => operation.operationId)
      .sort()

    expect(outboundOperationIds).toEqual([
      "ads.publishCampaign",
      "appointments.book",
      "broadcasts.resend",
      "broadcasts.resume",
      "broadcasts.schedule",
      "channels.sendMessage",
      "contacts.bulkSubscribeSequences",
      "contacts.sendFlow",
      "contacts.sendMessage",
      "contacts.subscribeSequences",
      "contacts.triggerAutoReply",
      "conversations.enableBot",
      "conversations.threadControl",
      "coupons.issueCoupon",
      "facebookMarketingMessages.campaigns.resume",
      "facebookMarketingMessages.campaigns.send",
      "flows.publish",
      "instagramChannels.sendCapiTestEvent",
      "leaderboards.publish",
      "leaderboards.triggerRewards",
      "messages.create",
      "messages.sendWhatsappTemplate",
      "messengerChannels.sendCapiTestEvent",
      "miniApps.publishWhatsapp",
      "miniApps.publishWhatsappDraft",
      "miniApps.pushWhatsappDraft",
      "whatsappChannels.sendCapiTestEvent",
    ])
  })
})

describe("x-mcp policy classifications", () => {
  test("marks every DELETE operation as destructive", () => {
    const nonDestructiveDeletes = operations
      .filter(isWorkspaceTokenOperation)
      .filter((operation) => operation.method === "DELETE")
      .filter(
        (operation) => operation["x-mcp"]?.hitlPolicy !== "confirm_destructive",
      )
      .map((operation) => operation.operationId)

    expect(nonDestructiveDeletes).toEqual([])
  })

  test.each([
    ["flows.publish", "confirm_outbound"],
    ["contacts.bulkDelete", "confirm_destructive"],
    ["contacts.bulkAddTags", "confirm_diff"],
    ["contacts.import", "confirm_diff"],
    ["connections.disconnect", "confirm_destructive"],
    ["contacts.clearCustomFields", "confirm_destructive"],
    ["conversations.archive", "confirm_destructive"],
    ["contacts.bulkSubscribeSequences", "confirm_outbound"],
  ] as const)("classifies %s as %s in the generated spec", (operationId, policy) => {
    expect(
      operations.find((operation) => operation.operationId === operationId)?.[
        "x-mcp"
      ]?.hitlPolicy,
    ).toBe(policy)
  })

  test("preserves explicit hints and idempotency parameters across reruns", () => {
    const spec = {
      paths: {
        "/v1/example": {
          post: {
            operationId: "example.remove",
            responses: {},
            "x-mcp": { destructiveHint: false, hitlPolicy: "confirm_diff" },
          },
        },
      },
    }

    withMcpHitlPolicy(spec as never)
    withIdempotencyKeyHeader(spec as never)
    withIdempotencyKeyHeader(spec as never)

    const operation = spec.paths["/v1/example"]
      .post as (typeof spec.paths)["/v1/example"]["post"] & {
      parameters?: unknown[]
    }
    expect(operation["x-mcp"]).toMatchObject({
      destructiveHint: false,
      hitlPolicy: "confirm_diff",
    })
    expect(operation.parameters).toHaveLength(1)
  })

  test("does not advertise aiFiles.search to read-only tokens", () => {
    expect(
      operations.find(
        (operation) => operation.operationId === "aiFiles.search",
      )?.["x-mcp"]?.readOnlyHint,
    ).toBeUndefined()
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

  test("the read-only Google Ads operations are hidden, not default", () => {
    const googleAds = operations.filter((op) =>
      op.operationId.startsWith("googleAds."),
    )

    expect(googleAds.map((op) => op.operationId).sort()).toEqual([
      "googleAds.getConnection",
      "googleAds.getStats",
      "googleAds.listEvents",
    ])
    expect(googleAds.map((op) => op["x-mcp"]?.visibility)).not.toContain(
      "default",
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
