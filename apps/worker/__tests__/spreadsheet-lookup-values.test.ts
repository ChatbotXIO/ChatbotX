import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  getAll: vi.fn(),
  replaceAll: vi.fn(),
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: mocks.getAll,
    replaceAll: mocks.replaceAll,
  },
}))

const { resolveSpreadsheetLookup } = await import(
  "../src/integration/handlers/spreadsheet-lookup-values"
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

describe("spreadsheet lookup values", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAll.mockResolvedValue({ customFieldsMap: new Map() })
    mocks.replaceAll.mockImplementation(async ({ text }: { text: string }) =>
      text.replace("{{raw:Email}}", "ada@example.com"),
    )
  })

  test("resolves variable templates in each condition value", async () => {
    await expect(
      resolveSpreadsheetLookup({
        ...baseProps,
        step: {
          lookup: {
            mode: "AND",
            conditions: [
              { column: "Email", operator: "is", value: "{{raw:Email}}" },
              { column: "Status", operator: "is", value: "active" },
            ],
          },
        },
      } as Parameters<typeof resolveSpreadsheetLookup>[0]),
    ).resolves.toEqual({
      mode: "AND",
      conditions: [
        { column: "Email", operator: "is", value: "ada@example.com" },
        { column: "Status", operator: "is", value: "active" },
      ],
    })

    expect(mocks.getAll).toHaveBeenCalledTimes(1)
    expect(mocks.replaceAll).toHaveBeenCalledTimes(2)
  })

  test("skips variable loading when there are no conditions", async () => {
    await expect(
      resolveSpreadsheetLookup({
        ...baseProps,
        step: { lookup: { mode: "OR", conditions: [] } },
      } as Parameters<typeof resolveSpreadsheetLookup>[0]),
    ).resolves.toEqual({ mode: "OR", conditions: [] })

    expect(mocks.getAll).not.toHaveBeenCalled()
    expect(mocks.replaceAll).not.toHaveBeenCalled()
  })

  test("coerces a missing value to an empty string", async () => {
    await resolveSpreadsheetLookup({
      ...baseProps,
      step: {
        lookup: {
          mode: "AND",
          conditions: [{ column: "Email", operator: "is" }],
        },
      },
    } as Parameters<typeof resolveSpreadsheetLookup>[0])

    expect(mocks.replaceAll).toHaveBeenCalledWith({
      text: "",
      variables: { customFieldsMap: new Map() },
    })
  })
})
