import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Covers the sheetToContact write path in `updateContactCustomFields`
// (apps/worker/src/integration/handlers/spreadsheet-handler.ts): a mapping
// row's `customFieldId` may now be a `bot_field:<id>` reference token
// (Account Field) alongside a plain ContactCustomField id. Bot-field entries
// must route to `botFieldService.updateByKey` individually (they can't ride
// the batched `contactCustomFieldService.setValues` call), a failing bot
// entry must be logged and skipped rather than failing the whole step, and
// real custom fields in the same mapping must still flow through `setValues`
// unchanged.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  setValues: vi.fn(async () => undefined),
  listValues: vi.fn(async () => []),
  updateByKey: vi.fn(async () => undefined),
  findManyByIds: vi.fn(async () => []),
  findByWorkspaceIdOrFail: vi.fn(async () => ({ auth: {} })),
  findSpreadsheetByWorkspaceIdOrFail: vi.fn(async () => ({
    spreadsheetId: "sheet-abc",
  })),
  buildContext: vi.fn(async () => ({})),
  runAction: vi.fn(),
  loggerWarn: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  buildContext: mocks.buildContext,
  botFieldService: {
    updateByKey: mocks.updateByKey,
    findManyByIds: mocks.findManyByIds,
  },
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
  logger: { error: vi.fn(), info: vi.fn(), warn: mocks.loggerWarn },
}))

const { getSpreadsheetRow, sendSpreadsheetData } = await import(
  "../src/integration/handlers/spreadsheet-handler"
)

const CONVERSATION = {
  workspaceId: "ws-1",
  contactId: "contact-1",
} as unknown as Parameters<typeof getSpreadsheetRow>[0]["conversation"]

describe("spreadsheet handler - Account Field (bot_field) writes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByWorkspaceIdOrFail.mockResolvedValue({ auth: {} })
    mocks.findSpreadsheetByWorkspaceIdOrFail.mockResolvedValue({
      spreadsheetId: "sheet-abc",
    })
    mocks.runAction
      .mockResolvedValueOnce(["Name", "Birthday"])
      .mockResolvedValueOnce([["Alice", "23/07/2026"]])
  })

  test("routes a bot_field mapping entry to botFieldService.updateByKey instead of setValues", async () => {
    const result = await getSpreadsheetRow({
      conversation: CONVERSATION,
      step: {
        spreadsheetId: "spreadsheet-1",
        sheetName: "Sheet1",
        lookup: { mode: "all", conditions: [] },
        map: [{ header: "Name", customFieldId: "bot_field:9" }],
      },
    } as unknown as Parameters<typeof getSpreadsheetRow>[0])

    expect(result.status).toBe("success")
    expect(mocks.updateByKey).toHaveBeenCalledTimes(1)
    expect(mocks.updateByKey).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      key: "9",
      data: { value: "Alice" },
    })
    expect(mocks.setValues).not.toHaveBeenCalled()
  })

  test("splits a mapping with both a bot field and a real custom field between the two write paths", async () => {
    const result = await getSpreadsheetRow({
      conversation: CONVERSATION,
      step: {
        spreadsheetId: "spreadsheet-1",
        sheetName: "Sheet1",
        lookup: { mode: "all", conditions: [] },
        map: [
          { header: "Name", customFieldId: "bot_field:9" },
          { header: "Birthday", customFieldId: "cf-date" },
        ],
      },
    } as unknown as Parameters<typeof getSpreadsheetRow>[0])

    expect(result.status).toBe("success")
    expect(mocks.updateByKey).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      key: "9",
      data: { value: "Alice" },
    })
    expect(mocks.setValues).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [{ customFieldId: "cf-date", value: "23/07/2026" }],
      }),
    )
  })

  test("logs and skips a failing bot field entry without failing the step or blocking real custom fields", async () => {
    mocks.updateByKey.mockRejectedValueOnce(new Error("Bot field not found"))

    const result = await getSpreadsheetRow({
      conversation: CONVERSATION,
      step: {
        spreadsheetId: "spreadsheet-1",
        sheetName: "Sheet1",
        lookup: { mode: "all", conditions: [] },
        map: [
          { header: "Name", customFieldId: "bot_field:404" },
          { header: "Birthday", customFieldId: "cf-date" },
        ],
      },
    } as unknown as Parameters<typeof getSpreadsheetRow>[0])

    expect(result.status).toBe("success")
    expect(mocks.loggerWarn).toHaveBeenCalledTimes(1)
    expect(mocks.setValues).toHaveBeenCalledWith(
      expect.objectContaining({
        fields: [{ customFieldId: "cf-date", value: "23/07/2026" }],
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// Covers the Contact→Sheet write path (`sendSpreadsheetData` ->
// `resolveFromCustomFields` in spreadsheet-write-values.ts): the schema
// already accepted a `bot_field:<id>` token in a v1 mapping, but the runtime
// only read ContactCustomField values, so a bot token silently wrote a blank
// cell. Fixed to read the bot field's value instead, consistent with the
// Sheet→Contact direction covered above.
// ---------------------------------------------------------------------------
describe("spreadsheet handler - Contact→Sheet Account Field (bot_field) reads", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findByWorkspaceIdOrFail.mockResolvedValue({ auth: {} })
    mocks.findSpreadsheetByWorkspaceIdOrFail.mockResolvedValue({
      spreadsheetId: "sheet-abc",
    })
    mocks.listValues.mockResolvedValue([])
    mocks.findManyByIds.mockResolvedValue([])
  })

  test("a Contact→Sheet mapping with a bot token writes the bot field's value, not blank", async () => {
    mocks.runAction
      .mockResolvedValueOnce(["Name", "Tier"]) // listSheetHeaders
      .mockResolvedValueOnce(undefined) // insertRow
    mocks.findManyByIds.mockResolvedValue([{ id: "9", value: "Gold Tier" }])

    const result = await sendSpreadsheetData({
      conversation: CONVERSATION,
      step: {
        spreadsheetId: "spreadsheet-1",
        sheetName: "Sheet1",
        map: [
          { header: "Name", customFieldId: "cf-name" },
          { header: "Tier", customFieldId: "bot_field:9" },
        ],
      },
    } as unknown as Parameters<typeof sendSpreadsheetData>[0])

    expect(result.status).toBe("success")
    expect(mocks.findManyByIds).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      ids: ["9"],
    })
    expect(mocks.runAction).toHaveBeenCalledWith(
      "insertRow",
      expect.objectContaining({
        props: expect.objectContaining({ data: ["", "Gold Tier"] }),
      }),
    )
  })
})
