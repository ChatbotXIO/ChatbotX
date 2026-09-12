import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
}

type ProcedureHandler = (args: {
  context: { workspace: { id: string } }
  input: unknown
}) => unknown

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

const importService = {
  find: vi.fn(),
  list: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ importService }))

vi.mock("@chatbotx.io/business/errors", () => ({
  notFoundException: (message: string) => new Error(message),
}))

await import("@/features/import/api/public")

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

const scopeArgAtImport = workspaceTokenAuthAPIForScope.mock.calls[0]?.[0]

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the contact import public router under the contacts scope", () => {
  expect(scopeArgAtImport).toBe("contacts")
})

describe("GET /v1/contacts/imports", () => {
  const procedure = findProcedure("GET", "/v1/contacts/imports")

  test("lists only contact import jobs in the token workspace", async () => {
    const result = {
      data: [{ id: "import-1", type: "contacts" }],
      pageCount: 1,
    }
    importService.list.mockResolvedValueOnce(result)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { page: 2, perPage: 25, status: "completed", keyword: "people" },
      }),
    ).resolves.toEqual(result)

    expect(importService.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      type: "contacts",
      page: 2,
      perPage: 25,
      status: "completed",
      keyword: "people",
    })
  })
})

describe("GET /v1/contacts/imports/{id}", () => {
  const procedure = findProcedure("GET", "/v1/contacts/imports/{id}")

  test("returns the workspace-scoped contact import job", async () => {
    const imported = { id: "import-1", type: "contacts" }
    importService.find.mockResolvedValueOnce(imported)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "import-1" },
      }),
    ).resolves.toEqual(imported)

    expect(importService.find).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "import-1",
      type: "contacts",
    })
  })

  test("returns not found when the import is absent or outside contacts scope", async () => {
    importService.find.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { id: "missing" },
      }),
    ).rejects.toThrow("Import not found")
  })
})
