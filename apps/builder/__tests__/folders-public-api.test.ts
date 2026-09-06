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

const folderService = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  bulkDelete: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ folderService }))

vi.mock("@chatbotx.io/database/schema", () => {
  const schema = {
    pick: vi.fn(() => schema),
    extend: vi.fn(() => schema),
    omit: vi.fn(() => schema),
  }
  return {
    createSelectSchema: vi.fn(() => schema),
    folderModel: {},
  }
})

await import("@/features/folders/api/public")

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

test("registers the folders public router under the contacts scope", () => {
  expect(scopeArgAtImport).toBe("contacts")
})

describe("GET /v1/folders", () => {
  const procedure = findProcedure("GET", "/v1/folders")

  test("lists folders for the given type at the root when parentId is omitted", async () => {
    folderService.list.mockResolvedValueOnce([{ id: "f-1", name: "My Tags" }])

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { folderType: "tag" },
      }),
    ).resolves.toEqual({ data: [{ id: "f-1", name: "My Tags" }] })

    expect(folderService.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      folderType: "tag",
      parentId: null,
    })
  })
})

describe("POST /v1/folders", () => {
  const procedure = findProcedure("POST", "/v1/folders")

  test("creates a top-level folder when parentId is the root sentinel", async () => {
    folderService.create.mockResolvedValueOnce({ id: "f-1", name: "New" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { name: "New", folderType: "tag", parentId: "0" },
    })

    expect(folderService.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      data: { name: "New", folderType: "tag", parentId: null },
    })
  })

  test("creates a nested folder when a real parentId is given", async () => {
    folderService.create.mockResolvedValueOnce({ id: "f-2", name: "Child" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { name: "Child", folderType: "tag", parentId: "f-1" },
    })

    expect(folderService.create).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      data: { name: "Child", folderType: "tag", parentId: "f-1" },
    })
  })
})

describe("PUT /v1/folders/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/folders/{id}")

  test("renames the folder", async () => {
    folderService.update.mockResolvedValueOnce({ id: "f-1", name: "Renamed" })

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "f-1", name: "Renamed" },
    })

    expect(folderService.update).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "f-1",
      data: { name: "Renamed" },
    })
  })
})

describe("DELETE /v1/folders/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/folders/{id}")

  test("deletes the folder", async () => {
    folderService.bulkDelete.mockResolvedValueOnce(undefined)

    await procedure.handler?.({
      context: { workspace: { id: "workspace-1" } },
      input: { id: "f-1" },
    })

    expect(folderService.bulkDelete).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["f-1"],
    })
  })
})
