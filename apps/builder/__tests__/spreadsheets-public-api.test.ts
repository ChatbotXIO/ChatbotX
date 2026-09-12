import { beforeEach, describe, expect, test, vi } from "vitest"

type RouteConfig = {
  method: string
  path: string
  summary: string
  tags: string[]
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
  possibleErrorsOnFindingResource: {},
  possibleErrorsOnListingResource: {},
}))

const { listSpreadsheets, listWorksheets, listWorksheetHeaders } = vi.hoisted(
  () => ({
    listSpreadsheets: vi.fn(),
    listWorksheets: vi.fn(),
    listWorksheetHeaders: vi.fn(),
  }),
)

vi.mock("@/features/spreadsheets/queries/list-spreadsheet.queries", () => ({
  listSpreadsheets,
}))
vi.mock("@/features/spreadsheets/queries/list-worksheet.queries", () => ({
  listWorksheets,
  listWorksheetHeaders,
}))

vi.mock("@/features/spreadsheets/schema/public", () => ({
  listSpreadsheetsPublicRequest: {},
  listSpreadsheetsPublicResponse: {},
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
    listSpreadsheets.mockResolvedValueOnce(result)

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: { page: 2, perPage: 25, name: "Sales" },
      }),
    ).resolves.toEqual(result)

    expect(listSpreadsheets).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      page: 2,
      perPage: 25,
      name: "Sales",
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
        context: { workspace: { id: "workspace-1" } },
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
        context: { workspace: { id: "workspace-1" } },
        input: { spreadsheetId: "missing-spreadsheet" },
      }),
    ).rejects.toThrow("Spreadsheet not found")
    expect(procedure.errors).toBeDefined()
  })
})

describe("GET /v1/spreadsheets/{spreadsheetId}/worksheets/{worksheetId}/headers", () => {
  const procedure = findProcedure(
    "GET",
    "/v1/spreadsheets/{spreadsheetId}/worksheets/{worksheetId}/headers",
  )

  test("lists headers using the worksheet path identifier as the sheet name", async () => {
    listWorksheetHeaders.mockResolvedValueOnce({ data: ["Email", "Name"] })

    await expect(
      procedure.handler?.({
        context: { workspace: { id: "workspace-1" } },
        input: {
          spreadsheetId: "spreadsheet-1",
          worksheetId: "Leads",
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
