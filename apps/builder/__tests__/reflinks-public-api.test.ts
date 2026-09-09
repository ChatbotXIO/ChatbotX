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

const reflinkService = {
  list: vi.fn(),
  findOrFail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  deleteMany: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ reflinkService }))

vi.mock("@chatbotx.io/database/schema", () => {
  const schema = {
    pick: vi.fn(() => schema),
    extend: vi.fn(() => schema),
    omit: vi.fn(() => schema),
    and: vi.fn(() => schema),
    optional: vi.fn(() => schema),
  }
  return {
    createSelectSchema: vi.fn(() => schema),
    reflinkModel: {},
  }
})

await import("@/features/reflinks/api/public")

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

test("registers the reflinks public router under the automation scope", () => {
  expect(scopeArgAtImport).toBe("automation")
})

describe("GET /v1/ref-links", () => {
  const procedure = findProcedure("GET", "/v1/ref-links")

  test("delegates to reflinkService.list", async () => {
    reflinkService.list.mockResolvedValueOnce({ data: [], pageCount: 1 })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50 },
    })

    expect(reflinkService.list).toHaveBeenCalledWith({
      page: 1,
      perPage: 50,
      workspaceId: "workspace-1",
    })
  })
})

describe("GET /v1/ref-links/{id}", () => {
  const procedure = findProcedure("GET", "/v1/ref-links/{id}")

  test("delegates to reflinkService.findOrFail", async () => {
    reflinkService.findOrFail.mockResolvedValueOnce({ id: "reflink-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "reflink-1" },
    })

    expect(reflinkService.findOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "reflink-1",
    })
  })
})

describe("POST /v1/ref-links", () => {
  const procedure = findProcedure("POST", "/v1/ref-links")

  test("delegates to reflinkService.create", async () => {
    reflinkService.create.mockResolvedValueOnce({ id: "reflink-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { flowId: "flow-1", type: "refLink" },
    })

    expect(reflinkService.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      data: { flowId: "flow-1", type: "refLink" },
    })
  })
})

describe("PUT /v1/ref-links/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/ref-links/{id}")

  test("delegates to reflinkService.update", async () => {
    reflinkService.update.mockResolvedValueOnce({ id: "reflink-1" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "reflink-1", flowId: "flow-2" },
    })

    expect(reflinkService.update).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "reflink-1" },
      { flowId: "flow-2" },
    )
  })
})

describe("DELETE /v1/ref-links/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/ref-links/{id}")

  test("delegates to reflinkService.deleteMany", async () => {
    reflinkService.deleteMany.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "reflink-1" },
    })

    expect(reflinkService.deleteMany).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["reflink-1"],
    })
  })
})
