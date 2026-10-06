// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

vi.mock("@chatbotx.io/database/client", () => {
  const proxy: unknown = new Proxy(() => proxy, { get: () => proxy })
  return { db: proxy }
})

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
  successStatus?: number
}

type CapturedProcedure = {
  route: RouteConfig
  inputSchema?: { safeParse: (value: unknown) => { success: boolean } }
  handler?: (...args: unknown[]) => unknown
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn((schema: CapturedProcedure["inputSchema"]) => {
        record.inputSchema = schema
        return chain
      }),
      output: vi.fn(() => chain),
      errors: vi.fn(() => chain),
      handler: vi.fn((fn: (...args: unknown[]) => unknown) => {
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

const sequenceService = {
  list: vi.fn(),
  findWithSteps: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  assertOwned: vi.fn(),
  upsertStep: vi.fn(),
  deleteStep: vi.fn(),
}
vi.mock("@chatbotx.io/business/sequence", () => ({ sequenceService }))

vi.mock("../src/features/sequences/queries", () => ({
  listSequences: vi.fn(),
}))

await import("@/features/sequences/api/public")

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

test("registers the sequences public router under the broadcasts scope", () => {
  expect(scopeArgAtImport).toBe("broadcasts")
})

describe("GET /v1/sequences", () => {
  const procedure = findProcedure("GET", "/v1/sequences")

  test("forwards filters and keeps newest-first as the default sort", async () => {
    sequenceService.list.mockResolvedValue({ data: [], pageCount: 0 })

    await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { page: 1, perPage: 10, name: "wel", folderId: "5", active: true },
    })
    await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { page: 1, perPage: 10, sort: [{ id: "name", desc: false }] },
    })

    expect(sequenceService.list).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workspaceId: "ws-1",
        name: "wel",
        folderId: "5",
        active: true,
        sort: [{ id: "createdAt", desc: true }],
      }),
    )
    expect(sequenceService.list).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sort: [{ id: "name", desc: false }] }),
    )
  })
})

describe("POST /v1/sequences", () => {
  const procedure = findProcedure("POST", "/v1/sequences")

  test("sources workspaceId from context", async () => {
    sequenceService.create.mockResolvedValueOnce({ sequenceId: "seq-1" })

    const result = await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { name: "Welcome series" },
    })

    expect(sequenceService.create).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      name: "Welcome series",
    })
    expect(result).toEqual({ sequenceId: "seq-1" })
  })
})

describe("PATCH /v1/sequences/{id}", () => {
  const procedure = findProcedure("PATCH", "/v1/sequences/{id}")

  test("delegates to sequenceService.update scoped to context's workspace", async () => {
    sequenceService.update.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { id: "seq-1", active: false },
    })

    expect(sequenceService.update).toHaveBeenCalledWith(
      { workspaceId: "ws-1", id: "seq-1" },
      { active: false },
    )
  })
})

describe("DELETE /v1/sequences/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/sequences/{id}")

  test("delegates to sequenceService.delete scoped to context's workspace", async () => {
    sequenceService.delete.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { id: "seq-1" },
    })

    expect(sequenceService.delete).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "seq-1",
    })
  })
})

describe("PUT /v1/sequences/{id}/steps", () => {
  const procedure = findProcedure("PUT", "/v1/sequences/{id}/steps")

  test("asserts ownership before upserting, using the {id} path segment as sequenceId", async () => {
    sequenceService.assertOwned.mockResolvedValueOnce({ id: "seq-1" })
    sequenceService.upsertStep.mockResolvedValueOnce({ stepId: "step-1" })

    const result = await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: {
        id: "seq-1",
        order: 0,
        flowId: "flow-1",
      },
    })

    expect(sequenceService.assertOwned).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      sequenceId: "seq-1",
    })
    expect(sequenceService.upsertStep).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      sequenceId: "seq-1",
      stepId: undefined,
      data: { order: 0, flowId: "flow-1" },
    })
    expect(result).toEqual({ stepId: "step-1" })
  })

  test("throws before calling upsertStep when the sequence is not owned by this workspace", async () => {
    sequenceService.assertOwned.mockRejectedValueOnce(
      new Error("Sequence not found"),
    )

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "ws-1" } },
        input: { id: "seq-1", order: 0 },
      }),
    ).rejects.toThrow("Sequence not found")

    expect(sequenceService.upsertStep).not.toHaveBeenCalled()
  })
})

describe("DELETE /v1/sequences/{id}/steps/{stepId}", () => {
  const procedure = findProcedure("DELETE", "/v1/sequences/{id}/steps/{stepId}")

  test("asserts ownership before deleting the step", async () => {
    sequenceService.assertOwned.mockResolvedValueOnce({ id: "seq-1" })
    sequenceService.deleteStep.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "ws-1" } },
      input: { id: "seq-1", stepId: "step-1" },
    })

    expect(sequenceService.assertOwned).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      sequenceId: "seq-1",
    })
    // `sequenceId` is forwarded so the service can reject a step that
    // belongs to another sequence — without it the `{id}` path segment is
    // decorative and the step resolves by `stepId` alone.
    expect(sequenceService.deleteStep).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      sequenceId: "seq-1",
      stepId: "step-1",
    })
  })
})

describe("GET /v1/sequences/{id} input", () => {
  const schema = () =>
    capturedProcedures.find(
      (p) => p.route.method === "GET" && p.route.path === "/v1/sequences/{id}",
    )?.inputSchema

  test("accepts a numeric id", () => {
    expect(schema()?.safeParse({ id: "11714399357876729" }).success).toBe(true)
  })

  test("rejects a non-numeric id before the service is called", () => {
    expect(schema()?.safeParse({ id: "abc" }).success).toBe(false)
  })
})
