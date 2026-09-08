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

const triggerService = {
  listByWorkspaceId: vi.fn(),
  create: vi.fn(),
  updateWithConditions: vi.fn(),
  updateSettings: vi.fn(),
  deleteMany: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ triggerService }))

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

const triggerRepository = {
  findWithConditions: vi.fn(),
}
vi.mock("@chatbotx.io/database/repositories", () => ({ triggerRepository }))

vi.mock("@chatbotx.io/database/schema", () => {
  const schema = {
    pick: vi.fn(() => schema),
    extend: vi.fn(() => schema),
    omit: vi.fn(() => schema),
    and: vi.fn(() => schema),
  }
  return {
    createSelectSchema: vi.fn(() => schema),
    triggerModel: {},
  }
})

await import("@/features/triggers/api/public")

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

test("registers the triggers public router under the automation scope", () => {
  expect(scopeArgAtImport).toBe("automation")
})

describe("GET /v1/triggers", () => {
  const procedure = findProcedure("GET", "/v1/triggers")

  test("returns real conditions and actions, not hardcoded empty arrays", async () => {
    triggerService.listByWorkspaceId.mockResolvedValueOnce([
      { id: "trigger-1" },
    ])
    triggerRepository.findWithConditions.mockResolvedValueOnce({
      id: "trigger-1",
      conditions: [{ id: "c1", type: "newContact" }],
      actions: [{ id: "a1", type: "sendFlow" }],
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50 },
    })

    expect(triggerService.listByWorkspaceId).toHaveBeenCalledWith("workspace-1")
    expect(triggerRepository.findWithConditions).toHaveBeenCalledWith({
      id: "trigger-1",
      workspaceId: "workspace-1",
    })
    expect(result.data[0].conditions).toEqual([
      { id: "c1", type: "newContact" },
    ])
    expect(result.data[0].actions).toEqual([{ id: "a1", type: "sendFlow" }])
  })
})

describe("GET /v1/triggers/{id}", () => {
  const procedure = findProcedure("GET", "/v1/triggers/{id}")

  test("delegates to triggerRepository.findWithConditions", async () => {
    triggerRepository.findWithConditions.mockResolvedValueOnce({
      id: "trigger-1",
      conditions: [],
      actions: [],
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "trigger-1" },
    })

    expect(triggerRepository.findWithConditions).toHaveBeenCalledWith({
      id: "trigger-1",
      workspaceId: "workspace-1",
    })
  })

  test("throws not found when the trigger does not exist", async () => {
    triggerRepository.findWithConditions.mockResolvedValueOnce(null)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "missing" },
      }),
    ).rejects.toThrow("Trigger not found")
  })
})

describe("POST /v1/triggers", () => {
  const procedure = findProcedure("POST", "/v1/triggers")

  test("delegates to triggerService.create", async () => {
    triggerService.create.mockResolvedValueOnce({ id: "trigger-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { name: "New trigger" },
    })

    expect(triggerService.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      data: { name: "New trigger" },
      folderType: "trigger",
    })
  })
})

describe("PUT /v1/triggers/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/triggers/{id}")

  test("delegates to triggerService.updateWithConditions", async () => {
    triggerService.updateWithConditions.mockResolvedValueOnce({
      id: "trigger-1",
    })
    triggerRepository.findWithConditions.mockResolvedValueOnce({
      id: "trigger-1",
      conditions: [],
      actions: [],
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: {
        id: "trigger-1",
        conditions: [{ type: "newContact" }],
        actions: [{ type: "sendFlow" }],
      },
    })

    expect(triggerService.updateWithConditions).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "trigger-1",
      actions: [{ type: "sendFlow" }],
      conditions: [
        {
          id: undefined,
          type: "newContact",
          sourceId: null,
          operator: null,
          value: null,
        },
      ],
    })
  })

  test("throws not found when the trigger update fails to match", async () => {
    triggerService.updateWithConditions.mockResolvedValueOnce(null)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "missing", conditions: [], actions: [] },
      }),
    ).rejects.toThrow("Trigger not found")
  })
})

describe("PATCH /v1/triggers/{id}/settings", () => {
  const procedure = findProcedure("PATCH", "/v1/triggers/{id}/settings")

  test("delegates to triggerService.updateSettings", async () => {
    triggerService.updateSettings.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "trigger-1", active: false },
    })

    expect(triggerService.updateSettings).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "trigger-1",
      active: false,
    })
  })
})

describe("DELETE /v1/triggers/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/triggers/{id}")

  test("delegates to triggerService.deleteMany", async () => {
    triggerService.deleteMany.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "trigger-1" },
    })

    expect(triggerService.deleteMany).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["trigger-1"],
    })
  })
})
