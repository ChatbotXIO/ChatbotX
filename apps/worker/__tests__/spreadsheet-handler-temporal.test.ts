import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  setValues: vi.fn(async () => undefined),
  findByWorkspaceIdOrFail: vi.fn(async () => ({ auth: {} })),
  buildContext: vi.fn(async () => ({})),
  runAction: vi.fn(),
  findOrFail: vi.fn(async () => ({ spreadsheetId: "sheet-abc" })),
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: mocks.buildContext,
  contactCustomFieldService: { setValues: mocks.setValues },
  integrationGoogleSheetService: {
    findByWorkspaceIdOrFail: mocks.findByWorkspaceIdOrFail,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { contactCustomFieldModel: { findFirst: vi.fn() } } },
  findOrFail: mocks.findOrFail,
}))

vi.mock("@chatbotx.io/database/schema", () => ({ spreadsheetModel: {} }))

vi.mock("@chatbotx.io/integration-google-sheets", () => ({
  integration: { runAction: mocks.runAction },
}))

vi.mock("../src/integration/handlers/operator-handler", () => ({
  isMatchedRow: () => true,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

const { getSpreadsheetRow } = await import(
  "../src/integration/handlers/spreadsheet-handler"
)

const CONVERSATION = {
  workspaceId: "ws-1",
  contactId: "contact-1",
} as unknown as Parameters<typeof getSpreadsheetRow>[0]["conversation"]

describe("spreadsheet handler - temporal custom-field write", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByWorkspaceIdOrFail.mockResolvedValue({ auth: {} })
    mocks.findOrFail.mockResolvedValue({ spreadsheetId: "sheet-abc" })
    mocks.runAction
      .mockResolvedValueOnce(["Name", "Birthday"])
      .mockResolvedValueOnce([["Alice", "23/07/2026"]])
  })

  test("forwards lenient parsing and workspace strategy with the mapped fields", async () => {
    const result = await getSpreadsheetRow({
      conversation: CONVERSATION,
      step: {
        spreadsheetId: "spreadsheet-1",
        sheetName: "Sheet1",
        lookup: { mode: "all", conditions: [] },
        map: [{ header: "Birthday", customFieldId: "cf-d" }],
      },
    } as unknown as Parameters<typeof getSpreadsheetRow>[0])

    expect(result.status).toBe("success")
    expect(mocks.setValues).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "contact-1",
      fields: [{ customFieldId: "cf-d", value: "23/07/2026" }],
      temporalInputParsing: "lenient",
      sourceTimezoneStrategy: "workspace",
    })
  })
})
