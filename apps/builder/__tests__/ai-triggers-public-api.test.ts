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

const aiTriggerService = {
  list: vi.fn(),
  findOrFail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  duplicate: vi.fn(),
  deleteMany: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ aiTriggerService }))

vi.mock("@chatbotx.io/database/schema", () => {
  const schema = {
    pick: vi.fn(() => schema),
    extend: vi.fn(() => schema),
    omit: vi.fn(() => schema),
    and: vi.fn(() => schema),
  }
  return {
    createSelectSchema: vi.fn(() => schema),
    aiTriggerModel: {},
  }
})

await import("@/features/ai-triggers/api/public")

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

test("registers the ai-triggers public router under the automation scope", () => {
  expect(scopeArgAtImport).toBe("automation")
})

describe("GET /v1/ai-triggers", () => {
  const procedure = findProcedure("GET", "/v1/ai-triggers")

  test("delegates to aiTriggerService.list", async () => {
    aiTriggerService.list.mockResolvedValueOnce({ data: [], pageCount: 1 })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50 },
    })

    expect(aiTriggerService.list).toHaveBeenCalledWith({
      page: 1,
      perPage: 50,
      workspaceId: "workspace-1",
    })
  })
})

describe("GET /v1/ai-triggers/{id}", () => {
  const procedure = findProcedure("GET", "/v1/ai-triggers/{id}")

  test("delegates to aiTriggerService.findOrFail", async () => {
    aiTriggerService.findOrFail.mockResolvedValueOnce({ id: "ai-trigger-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "ai-trigger-1" },
    })

    expect(aiTriggerService.findOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "ai-trigger-1",
    })
  })
})

describe("POST /v1/ai-triggers", () => {
  const procedure = findProcedure("POST", "/v1/ai-triggers")

  test("delegates to aiTriggerService.create", async () => {
    aiTriggerService.create.mockResolvedValueOnce({ id: "ai-trigger-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { name: "New AI trigger" },
    })

    expect(aiTriggerService.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      data: { name: "New AI trigger" },
    })
  })
})

describe("PUT /v1/ai-triggers/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/ai-triggers/{id}")

  test("delegates to aiTriggerService.update", async () => {
    aiTriggerService.update.mockResolvedValueOnce({ id: "ai-trigger-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "ai-trigger-1", name: "Renamed" },
    })

    expect(aiTriggerService.update).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "ai-trigger-1" },
      { name: "Renamed" },
    )
  })
})

describe("POST /v1/ai-triggers/{id}/duplicate", () => {
  const procedure = findProcedure("POST", "/v1/ai-triggers/{id}/duplicate")

  test("delegates to aiTriggerService.duplicate", async () => {
    aiTriggerService.duplicate.mockResolvedValueOnce({ id: "ai-trigger-2" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "ai-trigger-1" },
    })

    expect(aiTriggerService.duplicate).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "ai-trigger-1",
    })
  })
})

describe("DELETE /v1/ai-triggers/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/ai-triggers/{id}")

  test("delegates to aiTriggerService.deleteMany", async () => {
    aiTriggerService.deleteMany.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "ai-trigger-1" },
    })

    expect(aiTriggerService.deleteMany).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["ai-trigger-1"],
    })
  })
})
