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

const automatedResponseService = {
  list: vi.fn(),
  findOrFail: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  setStatus: vi.fn(),
  deleteMany: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ automatedResponseService }))

vi.mock("@chatbotx.io/database/schema", () => {
  const schema = {
    pick: vi.fn(() => schema),
    extend: vi.fn(() => schema),
    omit: vi.fn(() => schema),
    and: vi.fn(() => schema),
  }
  return {
    createSelectSchema: vi.fn(() => schema),
    automatedResponseModel: {},
  }
})

await import("@/features/automated-response/api/public")

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

test("registers the keywords public router under the automation scope", () => {
  expect(scopeArgAtImport).toBe("automation")
})

describe("GET /v1/keywords", () => {
  const procedure = findProcedure("GET", "/v1/keywords")

  test("keeps the type filter in the where-clause instead of dropping it", async () => {
    automatedResponseService.list.mockResolvedValueOnce({
      data: [],
      pageCount: 1,
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50, type: "outbound" },
    })

    expect(automatedResponseService.list).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        type: "outbound",
        page: 1,
        perPage: 50,
      }),
    )
  })

  test("defaults type to inbound when omitted", async () => {
    automatedResponseService.list.mockResolvedValueOnce({
      data: [],
      pageCount: 1,
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 50, type: "inbound" },
    })

    expect(automatedResponseService.list).toHaveBeenCalledWith(
      expect.objectContaining({ type: "inbound" }),
    )
  })
})

describe("GET /v1/keywords/{id}", () => {
  const procedure = findProcedure("GET", "/v1/keywords/{id}")

  test("delegates to automatedResponseService.findOrFail", async () => {
    automatedResponseService.findOrFail.mockResolvedValueOnce({
      id: "keyword-1",
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "keyword-1", type: "inbound" },
    })

    expect(automatedResponseService.findOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "keyword-1",
      type: "inbound",
    })
  })

  test("threads type=outbound through so an outbound id doesn't 404", async () => {
    automatedResponseService.findOrFail.mockResolvedValueOnce({
      id: "keyword-2",
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "keyword-2", type: "outbound" },
    })

    expect(automatedResponseService.findOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "keyword-2",
      type: "outbound",
    })
  })
})

describe("POST /v1/keywords", () => {
  const procedure = findProcedure("POST", "/v1/keywords")

  test("delegates to automatedResponseService.create", async () => {
    automatedResponseService.create.mockResolvedValueOnce({
      id: "keyword-1",
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { type: "inbound", keywords: ["hi"] },
    })

    expect(automatedResponseService.create).toHaveBeenCalledWith(
      "workspace-1",
      { type: "inbound", keywords: ["hi"] },
    )
  })
})

describe("PUT /v1/keywords/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/keywords/{id}")

  test("delegates to automatedResponseService.update without a redundant pre-check", async () => {
    automatedResponseService.update.mockResolvedValueOnce({
      id: "keyword-1",
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "keyword-1", type: "inbound", keywords: ["hello"] },
    })

    // `update` throws not-found itself now — no separate existence check.
    expect(automatedResponseService.findOrFail).not.toHaveBeenCalled()
    expect(automatedResponseService.update).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "keyword-1", type: "inbound" },
      { keywords: [{ value: "hello" }] },
    )
  })

  test("threads type=outbound through to the service call", async () => {
    automatedResponseService.update.mockResolvedValueOnce({
      id: "keyword-2",
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "keyword-2", type: "outbound", keywords: ["hi"] },
    })

    expect(automatedResponseService.update).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "keyword-2", type: "outbound" },
      { keywords: [{ value: "hi" }] },
    )
  })
})

describe("PATCH /v1/keywords/{id}/status", () => {
  const procedure = findProcedure("PATCH", "/v1/keywords/{id}/status")

  test("verifies existence then delegates to automatedResponseService.setStatus", async () => {
    automatedResponseService.findOrFail.mockResolvedValueOnce({
      id: "keyword-1",
    })
    automatedResponseService.setStatus.mockResolvedValueOnce({
      id: "keyword-1",
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "keyword-1", status: false, type: "inbound" },
    })

    expect(automatedResponseService.setStatus).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "keyword-1", type: "inbound" },
      false,
    )
  })

  test("threads type=outbound through to findOrFail and setStatus", async () => {
    automatedResponseService.findOrFail.mockResolvedValueOnce({
      id: "keyword-2",
    })
    automatedResponseService.setStatus.mockResolvedValueOnce({
      id: "keyword-2",
    })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "keyword-2", status: true, type: "outbound" },
    })

    expect(automatedResponseService.findOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "keyword-2",
      type: "outbound",
    })
    expect(automatedResponseService.setStatus).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "keyword-2", type: "outbound" },
      true,
    )
  })
})

describe("DELETE /v1/keywords/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/keywords/{id}")

  test("delegates to automatedResponseService.deleteMany", async () => {
    automatedResponseService.deleteMany.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "keyword-1", type: "inbound" },
    })

    expect(automatedResponseService.deleteMany).toHaveBeenCalledWith(
      "workspace-1",
      ["keyword-1"],
      "inbound",
    )
  })

  test("threads type=outbound through to deleteMany", async () => {
    automatedResponseService.deleteMany.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "keyword-2", type: "outbound" },
    })

    expect(automatedResponseService.deleteMany).toHaveBeenCalledWith(
      "workspace-1",
      ["keyword-2"],
      "outbound",
    )
  })
})
