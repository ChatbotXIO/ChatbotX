import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type ProcedureHandler = (...args: unknown[]) => unknown

type CapturedProcedure = {
  route: RouteConfig
  handler?: ProcedureHandler
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
      handler: vi.fn((fn: ProcedureHandler) => {
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

const aiFunctionService = {
  listAIFunctions: vi.fn(),
  findBy: vi.fn(),
  create: vi.fn(),
  updateAIFunction: vi.fn(),
  deleteAIFunction: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ aiFunctionService }))

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
    aiFunctionModel: {},
  }
})

// Deferred until after `vi.mock` calls above are hoisted, so the router
// module picks up the mocked `@/orpc`/`@chatbotx.io/business` bindings.
await import("@/features/ai-functions/api/public")

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

test("registers the ai-functions public router under the automation scope", () => {
  expect(scopeArgAtImport).toBe("automation")
})

describe("GET /v1/ai-functions", () => {
  const procedure = findProcedure("GET", "/v1/ai-functions")

  test("delegates to aiFunctionService.listAIFunctions", async () => {
    aiFunctionService.listAIFunctions.mockResolvedValueOnce({
      data: [],
      pageCount: 1,
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50 },
    })

    expect(aiFunctionService.listAIFunctions).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1" }),
    )
  })
})

describe("GET /v1/ai-functions/{id}", () => {
  const procedure = findProcedure("GET", "/v1/ai-functions/{id}")

  test("delegates to aiFunctionService.findBy", async () => {
    aiFunctionService.findBy.mockResolvedValueOnce({ id: "function-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "function-1" },
    })

    expect(aiFunctionService.findBy).toHaveBeenCalledWith({
      where: { id: "function-1", workspaceId: "workspace-1" },
    })
  })

  test("throws not found when the function does not exist", async () => {
    aiFunctionService.findBy.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "missing" },
      }),
    ).rejects.toThrow("AI function not found")
  })
})

describe("POST /v1/ai-functions", () => {
  const procedure = findProcedure("POST", "/v1/ai-functions")

  test("delegates to aiFunctionService.create and returns the created row", async () => {
    aiFunctionService.create.mockResolvedValueOnce([{ id: "function-1" }])

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { name: "Lookup order" },
    })

    expect(aiFunctionService.create).toHaveBeenCalledWith("workspace-1", {
      name: "Lookup order",
    })
    expect(result).toEqual({ id: "function-1" })
  })
})

describe("PUT /v1/ai-functions/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/ai-functions/{id}")

  test("delegates to aiFunctionService.updateAIFunction with no translator and returns its result", async () => {
    aiFunctionService.updateAIFunction.mockResolvedValueOnce({
      id: "function-1",
    })

    const result = await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "function-1", name: "Renamed" },
    })

    // Exactly 2 args: the public path never resolves a translator, unlike
    // the private action, which always passes one — toHaveBeenCalledWith
    // fails if a third argument were passed.
    expect(aiFunctionService.updateAIFunction).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "function-1" },
      { name: "Renamed" },
    )
    expect(result).toEqual({ id: "function-1" })
  })
})

describe("DELETE /v1/ai-functions/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/ai-functions/{id}")

  test("delegates to aiFunctionService.deleteAIFunction with no translator", async () => {
    aiFunctionService.deleteAIFunction.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "function-1" },
    })

    // Exactly 1 arg: the public path never resolves a translator.
    expect(aiFunctionService.deleteAIFunction).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      aiFunctionId: "function-1",
    })
  })
})
