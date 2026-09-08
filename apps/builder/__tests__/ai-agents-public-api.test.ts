import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
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

const aiAgentService = {
  listAIAgents: vi.fn(),
  findBy: vi.fn(),
  create: vi.fn(),
  updateAIAgent: vi.fn(),
  delete: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ aiAgentService }))

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

vi.mock("@chatbotx.io/database/schema", () => {
  const schema = {
    pick: vi.fn(() => schema),
    extend: vi.fn(() => schema),
    omit: vi.fn(() => schema),
    and: vi.fn(() => schema),
  }
  return {
    createSelectSchema: vi.fn(() => schema),
    aiAgentModel: {},
  }
})

await import("@/features/ai-agents/api/public")

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

test("registers the ai-agents public router under the automation scope", () => {
  expect(scopeArgAtImport).toBe("automation")
})

describe("GET /v1/ai-agents", () => {
  const procedure = findProcedure("GET", "/v1/ai-agents")

  test("delegates to aiAgentService.listAIAgents", async () => {
    aiAgentService.listAIAgents.mockResolvedValueOnce({
      data: [],
      pageCount: 1,
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50 },
    })

    expect(aiAgentService.listAIAgents).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
  })
})

describe("GET /v1/ai-agents/{id}", () => {
  const procedure = findProcedure("GET", "/v1/ai-agents/{id}")

  test("delegates to aiAgentService.findBy", async () => {
    aiAgentService.findBy.mockResolvedValueOnce({ id: "agent-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "agent-1" },
    })

    expect(aiAgentService.findBy).toHaveBeenCalledWith({
      where: { id: "agent-1", workspaceId: "workspace-1" },
    })
  })

  test("throws not found when the agent does not exist", async () => {
    aiAgentService.findBy.mockResolvedValueOnce(null)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "missing" },
      }),
    ).rejects.toThrow("AI agent not found")
  })
})

describe("POST /v1/ai-agents", () => {
  const procedure = findProcedure("POST", "/v1/ai-agents")

  test("delegates to aiAgentService.create then re-fetches via findBy", async () => {
    aiAgentService.create.mockResolvedValueOnce(undefined)
    aiAgentService.findBy.mockResolvedValueOnce({ id: "agent-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { name: "Support agent" },
    })

    expect(aiAgentService.create).toHaveBeenCalledWith("workspace-1", {
      name: "Support agent",
    })
    expect(aiAgentService.findBy).toHaveBeenCalledWith({
      where: { workspaceId: "workspace-1", name: "Support agent" },
    })
  })
})

describe("PUT /v1/ai-agents/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/ai-agents/{id}")

  test("delegates to aiAgentService.updateAIAgent then re-fetches via findBy", async () => {
    aiAgentService.updateAIAgent.mockResolvedValueOnce(undefined)
    aiAgentService.findBy.mockResolvedValueOnce({ id: "agent-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "agent-1", name: "Renamed" },
    })

    expect(aiAgentService.updateAIAgent).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "agent-1" },
      { name: "Renamed" },
    )
  })
})

describe("DELETE /v1/ai-agents/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/ai-agents/{id}")

  test("delegates to aiAgentService.delete", async () => {
    aiAgentService.delete.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "agent-1" },
    })

    expect(aiAgentService.delete).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["agent-1"],
    })
  })
})
