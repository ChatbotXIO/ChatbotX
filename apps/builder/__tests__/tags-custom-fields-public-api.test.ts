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

const tagService = {
  list: vi.fn(),
  create: vi.fn(),
  findByKeyOrFail: vi.fn(),
  update: vi.fn(),
  softDelete: vi.fn(),
}
const customFieldService = {
  list: vi.fn(),
  create: vi.fn(),
  findByKeyOrFail: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ tagService, customFieldService }))

await import("@/features/tags/api/public")
await import("@/features/custom-fields/api/public")

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

describe("GET /v1/tags", () => {
  const procedure = findProcedure("GET", "/v1/tags")

  test("defaults to newest first", async () => {
    tagService.list.mockResolvedValueOnce({ data: [], pageCount: 1 })

    await procedure.handler?.({
      context: tokenContext,
      input: { page: 1, perPage: 50 },
    })

    expect(tagService.list).toHaveBeenCalledWith({
      page: 1,
      perPage: 50,
      workspaceId: "workspace-1",
      sort: [{ id: "createdAt", desc: true }],
    })
  })

  test("forwards name, folderId and sort", async () => {
    tagService.list.mockResolvedValueOnce({ data: [], pageCount: 1 })

    await procedure.handler?.({
      context: tokenContext,
      input: {
        page: 1,
        perPage: 50,
        name: "vip",
        folderId: "0",
        sort: [{ id: "name", desc: false }],
      },
    })

    expect(tagService.list).toHaveBeenCalledWith({
      page: 1,
      perPage: 50,
      name: "vip",
      folderId: "0",
      workspaceId: "workspace-1",
      sort: [{ id: "name", desc: false }],
    })
  })
})

describe("POST /v1/tags", () => {
  const procedure = findProcedure("POST", "/v1/tags")

  test("passes folderId to tagService.create", async () => {
    tagService.create.mockResolvedValueOnce({
      data: { id: "1", name: "VIP", folderId: "7" },
    })

    const result = await procedure.handler?.({
      context: tokenContext,
      input: { name: "VIP", folderId: "7" },
    })

    expect(tagService.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      data: { name: "VIP", folderId: "7" },
    })
    expect(result).toEqual({ id: "1", name: "VIP", folderId: "7" })
  })
})

describe("PUT /v1/tags/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/tags/{id}")

  test("renames and moves the tag", async () => {
    tagService.update.mockResolvedValueOnce({ id: "1" })

    await procedure.handler?.({
      context: tokenContext,
      input: { id: "1", name: "VIP", folderId: "0" },
    })

    expect(tagService.update).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "1" },
      { name: "VIP", folderId: "0" },
    )
  })
})

describe("GET /v1/custom-fields", () => {
  const procedure = findProcedure("GET", "/v1/custom-fields")

  test("forwards filters and defaults to newest first", async () => {
    customFieldService.list.mockResolvedValueOnce({ data: [], pageCount: 1 })

    await procedure.handler?.({
      context: tokenContext,
      input: { page: 1, perPage: 50, name: "city", folderId: "3" },
    })

    expect(customFieldService.list).toHaveBeenCalledWith({
      page: 1,
      perPage: 50,
      name: "city",
      folderId: "3",
      workspaceId: "workspace-1",
      sort: [{ id: "createdAt", desc: true }],
    })
  })
})

describe("POST /v1/custom-fields", () => {
  const procedure = findProcedure("POST", "/v1/custom-fields")

  test("accepts description and maps the root folder to null", async () => {
    customFieldService.create.mockResolvedValueOnce({ id: "1" })

    await procedure.handler?.({
      context: tokenContext,
      input: { name: "city", type: "text", description: "Home", folderId: "0" },
    })

    expect(customFieldService.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      data: { name: "city", type: "text", description: "Home", folderId: null },
    })
  })
})

describe("GET /v1/custom-fields/{idOrName}", () => {
  const procedure = findProcedure("GET", "/v1/custom-fields/{idOrName}")

  test("uses findByKeyOrFail so an unknown field is a 404", async () => {
    customFieldService.findByKeyOrFail.mockRejectedValueOnce(
      Object.assign(new Error("Custom field not found"), { code: "notFound" }),
    )

    await expect(
      procedure.handler?.({
        context: tokenContext,
        input: { idOrName: "missing" },
      }),
    ).rejects.toMatchObject({ code: "notFound" })
    expect(customFieldService.findByKeyOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      key: "missing",
    })
  })
})

describe("PUT /v1/custom-fields/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/custom-fields/{id}")

  test("leaves the folder alone when folderId is omitted", async () => {
    customFieldService.update.mockResolvedValueOnce({ id: "1" })

    await procedure.handler?.({
      context: tokenContext,
      input: { id: "1", name: "city" },
    })

    expect(customFieldService.update).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "1" },
      { name: "city" },
    )
  })

  test("maps null to the root folder", async () => {
    customFieldService.update.mockResolvedValueOnce({ id: "1" })

    await procedure.handler?.({
      context: tokenContext,
      input: { id: "1", name: "city", folderId: null },
    })

    expect(customFieldService.update).toHaveBeenCalledWith(
      { workspaceId: "workspace-1", id: "1" },
      { name: "city", folderId: null },
    )
  })
})
