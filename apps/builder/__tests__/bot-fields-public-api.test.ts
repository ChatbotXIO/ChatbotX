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
  handler?: (...args: unknown[]) => unknown
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

const botFieldService = {
  list: vi.fn(),
  create: vi.fn(),
  findByKeyOrFail: vi.fn(),
  updateByKey: vi.fn(),
  bulkUpdateByKeys: vi.fn(),
  deleteByKey: vi.fn(),
  clearValueByKey: vi.fn(),
  bulkClearValues: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ botFieldService }))

await import("@/features/bot-fields/api/public")

const findProcedure = (method: string, path: string) => {
  const found = capturedProcedures.find(
    (procedure) =>
      procedure.route.method === method && procedure.route.path === path,
  )
  if (!found) {
    throw new Error(`No procedure registered for ${method} ${path}`)
  }
  return found
}

const tokenContext = { workspace: { id: "workspace-1" } }

beforeEach(() => {
  vi.clearAllMocks()
})

describe("PATCH /v1/bot-fields/{idOrName}", () => {
  const procedure = findProcedure("PATCH", "/v1/bot-fields/{idOrName}")

  test("passes only the given fields to updateByKey", async () => {
    botFieldService.updateByKey.mockResolvedValueOnce({ id: "1" })

    await procedure.handler?.({
      context: tokenContext,
      input: { idOrName: "score", name: "lead_score", folderId: null },
    })

    expect(botFieldService.updateByKey).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      key: "score",
      data: { name: "lead_score", folderId: null },
    })
  })
})

describe("PATCH /v1/bot-fields/{idOrName} with an empty body", () => {
  const procedure = findProcedure("PATCH", "/v1/bot-fields/{idOrName}")

  test("returns the field unchanged instead of writing", async () => {
    botFieldService.findByKeyOrFail.mockResolvedValueOnce({ id: "1" })

    const result = await procedure.handler?.({
      context: tokenContext,
      input: { idOrName: "score" },
    })

    expect(botFieldService.updateByKey).not.toHaveBeenCalled()
    expect(botFieldService.findByKeyOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      key: "score",
    })
    expect(result).toEqual({ id: "1" })
  })
})

describe("PUT /v1/bot-fields", () => {
  const procedure = findProcedure("PUT", "/v1/bot-fields")

  test("resolves each entry addressed by id", async () => {
    botFieldService.bulkUpdateByKeys.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: tokenContext,
      input: { fields: [{ id: 123, value: "pro" }] },
    })

    expect(botFieldService.bulkUpdateByKeys).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      updates: [{ key: "123", value: "pro" }],
    })
  })

  test("resolves each entry addressed by name", async () => {
    botFieldService.bulkUpdateByKeys.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: tokenContext,
      input: { fields: [{ name: "plan", value: "pro" }] },
    })

    expect(botFieldService.bulkUpdateByKeys).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      updates: [{ key: "plan", value: "pro" }],
    })
  })

  test("accepts the legacy `key` shape for backward compatibility", async () => {
    botFieldService.bulkUpdateByKeys.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: tokenContext,
      input: { fields: [{ key: "plan", value: "pro" }] },
    })

    expect(botFieldService.bulkUpdateByKeys).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      updates: [{ key: "plan", value: "pro" }],
    })
  })

  test("resolves a mixed batch of id, name, and legacy key entries in order", async () => {
    botFieldService.bulkUpdateByKeys.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: tokenContext,
      input: {
        fields: [
          { id: 1, value: "a" },
          { name: "plan", value: "b" },
          { key: "legacy-field", value: "c" },
        ],
      },
    })

    expect(botFieldService.bulkUpdateByKeys).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      updates: [
        { key: "1", value: "a" },
        { key: "plan", value: "b" },
        { key: "legacy-field", value: "c" },
      ],
    })
  })
})

describe("POST /v1/bot-fields/{idOrName}/reset", () => {
  const procedure = findProcedure("POST", "/v1/bot-fields/{idOrName}/reset")

  test("clears the value of one field addressed by id or name", async () => {
    const field = { id: "1", name: "plan", type: "text", value: null }
    botFieldService.clearValueByKey.mockResolvedValueOnce(field)

    const result = await procedure.handler?.({
      context: tokenContext,
      input: { idOrName: "plan" },
    })

    expect(botFieldService.clearValueByKey).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      key: "plan",
    })
    expect(result).toEqual(field)
  })
})

describe("POST /v1/bot-fields/bulk-reset", () => {
  const procedure = findProcedure("POST", "/v1/bot-fields/bulk-reset")

  test("clears the values of several fields in this workspace", async () => {
    botFieldService.bulkClearValues.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: tokenContext,
      input: { ids: ["1", "2"] },
    })

    expect(botFieldService.bulkClearValues).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["1", "2"],
    })
  })

  test("is a 204 route like the other body-less mutations", () => {
    expect(procedure.route.successStatus).toBe(204)
  })
})

describe("GET /v1/bot-fields", () => {
  const procedure = findProcedure("GET", "/v1/bot-fields")

  test("passes the name and folder filters through and defaults to newest first", async () => {
    botFieldService.list.mockResolvedValueOnce({ data: [], pageCount: 0 })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 20, name: "tok", folderId: "0" },
    })

    expect(botFieldService.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 1,
      perPage: 20,
      name: "tok",
      folderId: "0",
      sort: [{ id: "createdAt", desc: true }],
    })
  })

  test("honours an explicit sort", async () => {
    botFieldService.list.mockResolvedValueOnce({ data: [], pageCount: 0 })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { page: 1, perPage: 20, sort: [{ id: "name", desc: false }] },
    })

    expect(botFieldService.list).toHaveBeenCalledWith(
      expect.objectContaining({ sort: [{ id: "name", desc: false }] }),
    )
  })
})
