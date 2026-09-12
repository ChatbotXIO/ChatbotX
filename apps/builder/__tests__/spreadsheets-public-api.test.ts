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
  handler?: (...args: unknown[]) => Promise<unknown>
  errors?: unknown
}

const { workspaceTokenAuthAPIForScope, capturedProcedures } = vi.hoisted(() => {
  const capturedProcedures: CapturedProcedure[] = []

  const makeProcedure = (route: RouteConfig) => {
    const record: CapturedProcedure = { route }
    capturedProcedures.push(record)

    const chain = {
      input: vi.fn(() => chain),
      output: vi.fn(() => chain),
      errors: vi.fn((errors: unknown) => {
        record.errors = errors
        return chain
      }),
      handler: vi.fn((fn: (...args: unknown[]) => Promise<unknown>) => {
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

vi.mock("@/lib/orpc/orpc-error-helper", () => ({
  possibleErrorsOnCreatingResource: {},
  possibleErrorsOnDeletingResource: {},
  possibleErrorsOnFindingResource: {},
  possibleErrorsOnListingResource: {},
  possibleErrorsOnMutatingResource: {},
}))

const spreadsheetService = {
  list: vi.fn(),
  findByWorkspaceIdOrFail: vi.fn(),
  deleteMany: vi.fn(),
}
vi.mock("@chatbotx.io/business", () => ({ spreadsheetService }))

const { listWorksheets, listWorksheetHeaders } = vi.hoisted(() => ({
  listWorksheets: vi.fn(),
  listWorksheetHeaders: vi.fn(),
}))
vi.mock("@/features/spreadsheets/lib/google-sheets", () => ({
  listWorksheets,
  listWorksheetHeaders,
}))

const { createSpreadsheet, updateSpreadsheet } = vi.hoisted(() => ({
  createSpreadsheet: vi.fn(),
  updateSpreadsheet: vi.fn(),
}))
vi.mock("@/features/spreadsheets/lib/manage-spreadsheet", () => ({
  createSpreadsheet,
  updateSpreadsheet,
}))

vi.mock("@/features/spreadsheets/schema/public", () => ({
  listSpreadsheetsPublicRequest: {},
  listSpreadsheetsPublicResponse: {},
  getSpreadsheetPublicRequest: {},
  spreadsheetPublicResource: {},
  createSpreadsheetPublicRequest: {},
  createSpreadsheetPublicResponse: {},
  updateSpreadsheetPublicRequest: {},
  deleteSpreadsheetPublicRequest: {},
  listWorksheetHeadersPublicRequest: {},
  listWorksheetHeadersResponse: {},
  listWorksheetsPublicRequest: {},
  listWorksheetsResponse: {},
}))

await import("@/features/spreadsheets/api/public")

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
const context = { workspace: { id: "workspace-1" } }

beforeEach(() => {
  vi.clearAllMocks()
})

test("registers the spreadsheets public router under the automation scope", () => {
  expect(scopeArgAtImport).toBe("automation")
})

describe("GET /v1/spreadsheets", () => {
  const procedure = findProcedure("GET", "/v1/spreadsheets")

  test("lists the token workspace spreadsheets", async () => {
    const result = { data: [{ id: "spreadsheet-1" }], pageCount: 1 }
    spreadsheetService.list.mockResolvedValueOnce(result)

    await expect(
      procedure.handler?.({
        context,
        input: { page: 2, perPage: 25, name: "Sales" },
      }),
    ).resolves.toEqual(result)

    expect(spreadsheetService.list).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 2,
      perPage: 25,
      name: "Sales",
    })
  })
})

describe("GET /v1/spreadsheets/{id}", () => {
  const procedure = findProcedure("GET", "/v1/spreadsheets/{id}")

  test("gets a single spreadsheet in the token workspace", async () => {
    const record = { id: "spreadsheet-1", name: "Sales" }
    spreadsheetService.findByWorkspaceIdOrFail.mockResolvedValueOnce(record)

    await expect(
      procedure.handler?.({ context, input: { id: "spreadsheet-1" } }),
    ).resolves.toEqual(record)

    expect(spreadsheetService.findByWorkspaceIdOrFail).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      id: "spreadsheet-1",
    })
  })
})

describe("POST /v1/spreadsheets", () => {
  const procedure = findProcedure("POST", "/v1/spreadsheets")

  test("creates a spreadsheet in the token workspace", async () => {
    createSpreadsheet.mockResolvedValueOnce({ id: "spreadsheet-1" })
    const input = { name: "Sales", url: "https://docs.google.com/x" }

    await expect(procedure.handler?.({ context, input })).resolves.toEqual({
      id: "spreadsheet-1",
    })

    expect(createSpreadsheet).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "workspace-1", data: input }),
    )
  })
})

describe("PUT /v1/spreadsheets/{id}", () => {
  const procedure = findProcedure("PUT", "/v1/spreadsheets/{id}")

  test("updates a spreadsheet in the token workspace", async () => {
    const updated = { id: "spreadsheet-1", name: "Renamed" }
    updateSpreadsheet.mockResolvedValueOnce(updated)

    const input = {
      id: "spreadsheet-1",
      name: "Renamed",
      url: "https://docs.google.com/x",
    }

    await expect(procedure.handler?.({ context, input })).resolves.toEqual(
      updated,
    )

    expect(updateSpreadsheet).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        id: "spreadsheet-1",
        data: { name: "Renamed", url: "https://docs.google.com/x" },
      }),
    )
  })
})

describe("DELETE /v1/spreadsheets/{id}", () => {
  const procedure = findProcedure("DELETE", "/v1/spreadsheets/{id}")

  test("deletes a spreadsheet in the token workspace", async () => {
    spreadsheetService.deleteMany.mockResolvedValueOnce(undefined)

    await expect(
      procedure.handler?.({ context, input: { id: "spreadsheet-1" } }),
    ).resolves.toBeUndefined()

    expect(spreadsheetService.deleteMany).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["spreadsheet-1"],
    })
  })
})

describe("GET /v1/spreadsheets/{spreadsheetId}/worksheets", () => {
  const procedure = findProcedure(
    "GET",
    "/v1/spreadsheets/{spreadsheetId}/worksheets",
  )

  test("lists worksheets for a spreadsheet in the token workspace", async () => {
    listWorksheets.mockResolvedValueOnce({ data: ["Sheet1"] })

    await expect(
      procedure.handler?.({
        context,
        input: { spreadsheetId: "spreadsheet-1" },
      }),
    ).resolves.toEqual({ data: ["Sheet1"] })

    expect(listWorksheets).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      spreadsheetId: "spreadsheet-1",
    })
  })

  test("returns the declared not-found error from the shared query", async () => {
    const error = new Error("Spreadsheet not found")
    listWorksheets.mockRejectedValueOnce(error)

    await expect(
      procedure.handler?.({
        context,
        input: { spreadsheetId: "missing-spreadsheet" },
      }),
    ).rejects.toThrow("Spreadsheet not found")
    expect(procedure.errors).toBeDefined()
  })
})

describe("GET /v1/spreadsheets/{spreadsheetId}/worksheets/{worksheetName}/headers", () => {
  const procedure = findProcedure(
    "GET",
    "/v1/spreadsheets/{spreadsheetId}/worksheets/{worksheetName}/headers",
  )

  test("lists headers using the worksheet name path segment as the sheet name", async () => {
    listWorksheetHeaders.mockResolvedValueOnce({ data: ["Email", "Name"] })

    await expect(
      procedure.handler?.({
        context,
        input: {
          spreadsheetId: "spreadsheet-1",
          worksheetName: "Leads",
        },
      }),
    ).resolves.toEqual({ data: ["Email", "Name"] })

    expect(listWorksheetHeaders).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      spreadsheetId: "spreadsheet-1",
      sheetName: "Leads",
    })
  })
})
