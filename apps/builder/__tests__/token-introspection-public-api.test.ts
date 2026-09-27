import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type CapturedProcedure = {
  route: RouteConfig
  handler?: (...args: any[]) => any
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: (...args: any[]) => any) => {
        record.handler = fn
        return { handler: fn }
      }),
    }
    return chain
  }

  const workspaceTokenAuthAPI = {
    route: vi.fn((config: RouteConfig) => makeProcedure(config)),
  }

  return {
    workspaceTokenAuthAPIForScope: vi.fn(
      (_scope: string) => workspaceTokenAuthAPI,
    ),
    capturedProcedures,
  }
})

vi.mock("@/orpc", () => ({ workspaceTokenAuthAPIForScope }))

vi.mock("@chatbotx.io/business", () => ({
  quotaEnforcementService: {},
  userQuotaService: {},
}))

vi.mock("@chatbotx.io/business/errors", () => ({
  BROADCAST_PLAN_LIMIT_CODE: "broadcastPlanLimit",
  ChatbotXException: class extends Error {},
}))

await import("@/features/token/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (p) => p.route.method === method && p.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the token public router under the contacts scope", () => {
  expect(scopeArgAtImport).toBe("contacts")
})

describe("GET /v1/token", () => {
  const procedure = findProcedure("GET", "/v1/token")

  test("returns the calling token's workspace id, permission, and scopes", async () => {
    const result = await procedure.handler?.({
      context: {
        workspace: { id: "workspace-1" },
        apiToken: {
          id: "token-1",
          workspaceId: "workspace-1",
          permission: "full",
          scopes: ["contacts", "automation"],
          isDefault: false,
        },
      },
    })

    expect(result).toEqual({
      workspaceId: "workspace-1",
      permission: "full",
      scopes: ["contacts", "automation"],
    })
  })

  test("reports a read_only permission", async () => {
    const result = await procedure.handler?.({
      context: {
        workspace: { id: "workspace-1" },
        apiToken: {
          id: "token-2",
          workspaceId: "workspace-1",
          permission: "read_only",
          scopes: ["contacts"],
          isDefault: false,
        },
      },
    })

    expect(result.permission).toBe("read_only")
  })

  test("reports null scopes as unrestricted rather than an empty list", async () => {
    const result = await procedure.handler?.({
      context: {
        workspace: { id: "workspace-1" },
        apiToken: {
          id: "token-3",
          workspaceId: "workspace-1",
          permission: "full",
          scopes: null,
          isDefault: true,
        },
      },
    })

    expect(result.scopes).toBeNull()
  })
})
