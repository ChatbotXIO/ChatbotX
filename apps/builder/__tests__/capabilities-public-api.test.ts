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

const getCapabilities = vi.fn()
vi.mock("@chatbotx.io/business/capabilities", () => ({
  CAPABILITIES_INCLUDES: [
    "inboxes",
    "templates",
    "customFields",
    "botFields",
    "tags",
    "aiAgents",
    "sequences",
    "flows",
    "flowSpec",
  ],
  getCapabilities,
}))

await import("@/features/capabilities/api/public")

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

test("registers the capabilities public router under the contacts scope", () => {
  expect(scopeArgAtImport).toBe("contacts")
})

describe("GET /v1/capabilities", () => {
  const procedure = findProcedure("GET", "/v1/capabilities")

  test("delegates to getCapabilities with the workspace id and no include by default", async () => {
    getCapabilities.mockResolvedValueOnce({ tags: [{ id: "1", name: "VIP" }] })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {},
    })

    expect(getCapabilities).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      include: undefined,
    })
    expect(result).toEqual({ tags: [{ id: "1", name: "VIP" }] })
  })

  test("forwards a parsed include list", async () => {
    getCapabilities.mockResolvedValueOnce({})

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { include: ["tags", "flows"] },
    })

    expect(getCapabilities).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      include: ["tags", "flows"],
    })
  })
})

describe("GET /v1/schemas/flow-spec", () => {
  const procedure = findProcedure("GET", "/v1/schemas/flow-spec")

  test("returns a JSON Schema object describing the flow-spec DSL", async () => {
    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {},
    })

    // A real JSON Schema for a discriminated union of 8 step kinds — assert
    // it is genuinely derived from the zod schema (has the right shape),
    // not that it equals some hand-maintained fixture that could drift.
    expect(result).toHaveProperty("type")
    expect(JSON.stringify(result)).toContain("formatVersion")
    expect(JSON.stringify(result)).toContain("steps")
  })
})
