import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listValues: vi.fn(),
  getAll: vi.fn(),
  replaceAll: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactCustomFieldService: {
    listValues: mocks.listValues,
  },
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: mocks.getAll,
    replaceAll: mocks.replaceAll,
  },
}))

const { buildSpreadsheetWriteData } = await import(
  "../src/integration/handlers/spreadsheet-write-values"
)

const baseProps = {
  conversation: {
    workspaceId: "workspace-1",
    contactId: "contact-1",
  },
  contactInbox: {
    id: "contact-inbox-1",
  },
}

describe("spreadsheet write values", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listValues.mockResolvedValue([
      { customFieldId: "cf-name", value: "Ada" },
      { customFieldId: "cf-date", value: "2026-07-23T00:00:00.000Z" },
    ])
    mocks.getAll.mockResolvedValue({ customFieldsMap: new Map() })
    mocks.replaceAll.mockImplementation(async ({ text }: { text: string }) =>
      text.replace("{{raw:Name}}", "Ada"),
    )
  })

  test("resolves missing version as v1 with one custom-field query", async () => {
    await expect(
      buildSpreadsheetWriteData({
        ...baseProps,
        step: {
          map: [
            { header: "Name", customFieldId: "cf-name" },
            { header: "Birthday", customFieldId: "cf-date" },
          ],
        },
      } as Parameters<typeof buildSpreadsheetWriteData>[0]),
    ).resolves.toEqual(["Ada", "2026-07-23T00:00:00.000Z"])

    expect(mocks.listValues).toHaveBeenCalledTimes(1)
    expect(mocks.getAll).not.toHaveBeenCalled()
  })

  test("returns blanks for missing v1 values and items without customFieldId", async () => {
    await expect(
      buildSpreadsheetWriteData({
        ...baseProps,
        step: {
          version: "v1",
          map: [
            { header: "Missing", customFieldId: "cf-missing" },
            { header: "Blank" },
          ],
        },
      } as Parameters<typeof buildSpreadsheetWriteData>[0]),
    ).resolves.toEqual(["", ""])
  })

  test("resolves v2 values through variable templates", async () => {
    await expect(
      buildSpreadsheetWriteData({
        ...baseProps,
        step: {
          version: "v2",
          map: [
            { header: "Name", value: "{{raw:Name}}" },
            { header: "Empty", value: "" },
          ],
        },
      } as Parameters<typeof buildSpreadsheetWriteData>[0]),
    ).resolves.toEqual(["Ada", ""])

    expect(mocks.getAll).toHaveBeenCalledTimes(1)
    expect(mocks.replaceAll).toHaveBeenCalledTimes(2)
    expect(mocks.listValues).not.toHaveBeenCalled()
  })
})
