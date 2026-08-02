import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  setValues: vi.fn(async () => undefined),
  listValues: vi.fn(async () => []),
  findByWorkspaceIdOrFail: vi.fn(async () => ({ auth: {} })),
  findSpreadsheetByWorkspaceIdOrFail: vi.fn(async () => ({
    spreadsheetId: "sheet-abc",
  })),
  buildContext: vi.fn(async () => ({})),
  runAction: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: mocks.buildContext,
  contactCustomFieldService: {
    listValues: mocks.listValues,
    setValues: mocks.setValues,
  },
  integrationGoogleSheetService: {
    findByWorkspaceIdOrFail: mocks.findByWorkspaceIdOrFail,
  },
  spreadsheetService: {
    findByWorkspaceIdOrFail: mocks.findSpreadsheetByWorkspaceIdOrFail,
  },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: { query: { contactCustomFieldModel: { findFirst: vi.fn() } } },
}))

vi.mock("@chatbotx.io/integration-google-sheets", () => ({
  integration: { runAction: mocks.runAction },
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: vi.fn(),
    replaceAll: vi.fn(),
  },
}))

vi.mock("../src/integration/handlers/operator-handler", () => ({
  isMatchedRow: () => true,
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}))

const { getSpreadsheetRow, sendSpreadsheetData, updateSpreadsheetRow } =
  await import("../src/integration/handlers/spreadsheet-handler")

const CONVERSATION = {
  workspaceId: "ws-1",
  contactId: "contact-1",
} as unknown as Parameters<typeof getSpreadsheetRow>[0]["conversation"]

describe("spreadsheet handler - temporal custom-field write", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByWorkspaceIdOrFail.mockResolvedValue({ auth: {} })
    mocks.findSpreadsheetByWorkspaceIdOrFail.mockResolvedValue({
      spreadsheetId: "sheet-abc",
    })
    mocks.listValues.mockResolvedValue([
      { customFieldId: "cf-name", value: "Alice" },
      { customFieldId: "cf-date", value: "2026-07-23T00:00:00.000Z" },
    ])
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

  test("sendSpreadsheetData routes legacy v1 writes through the raw custom-field resolver", async () => {
    mocks.runAction.mockReset()
    // sendData now fetches the live headers to align values by column.
    mocks.runAction.mockResolvedValueOnce(["Name", "Birthday"])

    const result = await sendSpreadsheetData({
      conversation: CONVERSATION,
      step: {
        spreadsheetId: "spreadsheet-1",
        sheetName: "Sheet1",
        version: "v1",
        map: [
          { header: "Name", customFieldId: "cf-name" },
          { header: "Birthday", customFieldId: "cf-date" },
        ],
      },
    } as unknown as Parameters<typeof sendSpreadsheetData>[0])

    expect(result.status).toBe("success")
    expect(mocks.listValues).toHaveBeenCalledTimes(1)
    expect(mocks.runAction).toHaveBeenCalledWith("insertRow", {
      ctx: {},
      props: {
        spreadsheetId: "sheet-abc",
        sheetName: "Sheet1",
        data: ["Alice", "2026-07-23T00:00:00.000Z"],
      },
    })
  })

  test("updateSpreadsheetRow routes legacy missing-version writes through the raw custom-field resolver", async () => {
    mocks.runAction.mockReset()
    mocks.runAction
      .mockResolvedValueOnce(["Name", "Birthday"])
      .mockResolvedValueOnce([["Alice", "old"]])

    const result = await updateSpreadsheetRow({
      conversation: CONVERSATION,
      step: {
        spreadsheetId: "spreadsheet-1",
        sheetName: "Sheet1",
        lookup: { mode: "all", conditions: [] },
        map: [{ header: "Birthday", customFieldId: "cf-date" }],
      },
    } as unknown as Parameters<typeof updateSpreadsheetRow>[0])

    expect(result.status).toBe("success")
    expect(mocks.listValues).toHaveBeenCalledTimes(1)
    // The Birthday value lands in its own column (index 1) and the unmapped
    // "Name" column keeps its existing value instead of being shifted/blanked.
    expect(mocks.runAction).toHaveBeenLastCalledWith("updateRow", {
      ctx: {},
      props: {
        spreadsheetId: "sheet-abc",
        sheetName: "Sheet1",
        rowIndex: 0,
        data: ["Alice", "2026-07-23T00:00:00.000Z"],
      },
    })
  })
})
