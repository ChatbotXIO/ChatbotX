import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listValues: vi.fn(),
  getAll: vi.fn(),
  replaceAll: vi.fn(),
  findManyByIds: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  contactCustomFieldService: {
    listValues: mocks.listValues,
  },
  botFieldService: {
    findManyByIds: mocks.findManyByIds,
  },
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: mocks.getAll,
    replaceAll: mocks.replaceAll,
  },
}))

const { buildSpreadsheetWriteData, alignWriteValuesToHeaders } = await import(
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
    mocks.findManyByIds.mockResolvedValue([])
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

  // Regression for the P2 finding: a v1 Contact→Sheet mapping accepts a
  // `bot_field:<id>` token (schema already allows it), but `resolveFromCustomFields`
  // only queried ContactCustomField values — a bot token silently wrote a
  // blank cell. Consistent with Sheet→Contact, which already supports it.
  test("resolves a bot_field mapping to the bot field's value, not blank", async () => {
    mocks.findManyByIds.mockResolvedValue([{ id: "9", value: "Gold Tier" }])

    await expect(
      buildSpreadsheetWriteData({
        ...baseProps,
        step: {
          map: [
            { header: "Name", customFieldId: "cf-name" },
            { header: "Tier", customFieldId: "bot_field:9" },
          ],
        },
      } as Parameters<typeof buildSpreadsheetWriteData>[0]),
    ).resolves.toEqual(["Ada", "Gold Tier"])

    expect(mocks.findManyByIds).toHaveBeenCalledTimes(1)
    expect(mocks.findManyByIds).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["9"],
    })
  })

  test("resolves a blank/unset bot field to an empty string, not a lookup miss", async () => {
    mocks.findManyByIds.mockResolvedValue([{ id: "9", value: null }])

    await expect(
      buildSpreadsheetWriteData({
        ...baseProps,
        step: {
          map: [{ header: "Tier", customFieldId: "bot_field:9" }],
        },
      } as Parameters<typeof buildSpreadsheetWriteData>[0]),
    ).resolves.toEqual([""])
  })

  test("resolves a bot field whose id no longer exists to an empty string", async () => {
    mocks.findManyByIds.mockResolvedValue([])

    await expect(
      buildSpreadsheetWriteData({
        ...baseProps,
        step: {
          map: [{ header: "Tier", customFieldId: "bot_field:404" }],
        },
      } as Parameters<typeof buildSpreadsheetWriteData>[0]),
    ).resolves.toEqual([""])
  })

  test("batches distinct bot field ids in a single lookup, not per mapping", async () => {
    mocks.findManyByIds.mockResolvedValue([
      { id: "9", value: "Gold" },
      { id: "10", value: "42" },
    ])

    await expect(
      buildSpreadsheetWriteData({
        ...baseProps,
        step: {
          map: [
            { header: "Tier", customFieldId: "bot_field:9" },
            { header: "Score", customFieldId: "bot_field:10" },
            { header: "Tier again", customFieldId: "bot_field:9" },
          ],
        },
      } as Parameters<typeof buildSpreadsheetWriteData>[0]),
    ).resolves.toEqual(["Gold", "42", "Gold"])

    expect(mocks.findManyByIds).toHaveBeenCalledTimes(1)
    expect(mocks.findManyByIds).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      ids: ["9", "10"],
    })
  })

  test("skips the bot field lookup entirely when no mapping references one", async () => {
    await buildSpreadsheetWriteData({
      ...baseProps,
      step: {
        map: [{ header: "Name", customFieldId: "cf-name" }],
      },
    } as Parameters<typeof buildSpreadsheetWriteData>[0])

    expect(mocks.findManyByIds).not.toHaveBeenCalled()
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

describe("alignWriteValuesToHeaders", () => {
  const headers = ["timestamp", "messenger id", "aaa", "test", "ADdD"]

  test("places each value into the column matching its header, regardless of map order", () => {
    expect(
      alignWriteValuesToHeaders({
        map: [{ header: "aaa" }, { header: "timestamp" }],
        values: ["aaa-value", "ts-value"],
        headers,
      }),
    ).toEqual(["ts-value", "", "aaa-value", "", ""])
  })

  test("blanks unmapped columns when appending (no base row)", () => {
    expect(
      alignWriteValuesToHeaders({
        map: [{ header: "messenger id" }],
        values: ["user-123"],
        headers,
      }),
    ).toEqual(["", "user-123", "", "", ""])
  })

  test("skips mappings whose header no longer exists in the sheet", () => {
    expect(
      alignWriteValuesToHeaders({
        map: [{ header: "removed-column" }, { header: "test" }],
        values: ["orphan-value", "test-value"],
        headers,
      }),
    ).toEqual(["", "", "", "test-value", ""])
  })

  test("preserves unmapped columns from the base row on update", () => {
    expect(
      alignWriteValuesToHeaders({
        map: [{ header: "messenger id" }],
        values: ["new-id"],
        headers,
        baseRow: ["2025-01-01", "old-id", "keep-aaa", "keep-test", "keep-ADdD"],
      }),
    ).toEqual(["2025-01-01", "new-id", "keep-aaa", "keep-test", "keep-ADdD"])
  })

  test("falls back to an empty string when a mapped value is missing", () => {
    expect(
      alignWriteValuesToHeaders({
        map: [{ header: "timestamp" }],
        values: [],
        headers,
      }),
    ).toEqual(["", "", "", "", ""])
  })

  test("skipEmptyValues keeps the existing cell when a mapped value is empty", () => {
    expect(
      alignWriteValuesToHeaders({
        map: [
          { header: "timestamp" },
          { header: "messenger id" },
          { header: "aaa" },
        ],
        values: ["now", "", "phone"],
        headers,
        baseRow: ["old-ts", "keep-id", "old-aaa", "keep-test", "keep-ADdD"],
        skipEmptyValues: true,
      }),
    ).toEqual(["now", "keep-id", "phone", "keep-test", "keep-ADdD"])
  })
})
