import { FormatTimezone } from "@chatbotx.io/flow-config"
import { SourceTimezoneStrategy } from "@chatbotx.io/utils/datetime"
import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Covers the flow-step handler `formatDate` (apps/worker/src/integration/
// handlers/tool-handler.ts). It reads a stored temporal value, formats it as a
// human-readable STRING in the resolved source zone, and writes that string to
// the output field via the business service (so the custom-field-changed
// trigger still fires). Two invariants have no other coverage:
//   1. It must skip when the output field is itself temporal (date/datetime) —
//      writing a display string there would be re-parsed and corrupt the value.
//   2. The step's `timezone` choice must map to the correct resolver strategy.
// We mock ONLY the boundaries; `@chatbotx.io/utils/datetime` (the temporal-type
// guard) and `date-fns-tz` (the format-in-zone math) stay real.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  setValues: vi.fn(async () => undefined),
  setValueByKey: vi.fn(async () => undefined),
  botFieldFind: vi.fn(),
  botFieldFindByKey: vi.fn(),
  contactCustomFieldFindValue: vi.fn(),
  customFieldFindFirst: vi.fn(),
  createSourceTimezoneResolver: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  customFieldService: { findBy: mocks.customFieldFindFirst },
  contactCustomFieldService: {
    setValues: mocks.setValues,
    setValueByKey: mocks.setValueByKey,
    findValue: mocks.contactCustomFieldFindValue,
  },
  botFieldService: {
    find: mocks.botFieldFind,
    findByKey: mocks.botFieldFindByKey,
  },
  externalRequestService: {},
}))

vi.mock("@chatbotx.io/business/contact-custom-field", () => ({
  createSourceTimezoneResolver: mocks.createSourceTimezoneResolver,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      customFieldModel: { findFirst: vi.fn(), findMany: vi.fn() },
    },
  },
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: { getAll: vi.fn() },
  extractVariables: vi.fn(() => []),
  getSystemFieldValue: vi.fn(async () => null),
  interpolate: vi.fn((text: string) => text),
  resolveContactVariablesDeep: vi.fn(async (_id, value) => value),
}))

vi.mock("../src/lib/logger", () => ({
  logger: { error: mocks.loggerError },
}))

const { formatDate } = await import("../src/integration/handlers/tool-handler")

type Step = {
  inputFieldId: string
  outputFieldId: string
  format: string
  timezone: (typeof FormatTimezone)[keyof typeof FormatTimezone]
}

function props(step: Step, workspaceId = "ws-1", contactId = "c-1") {
  return {
    conversation: { workspaceId, contactId },
    step,
  } as unknown as Parameters<typeof formatDate>[0]
}

const step = (overrides: Partial<Step> = {}): Step => ({
  inputFieldId: "in-field",
  outputFieldId: "out-field",
  format: "yyyy-MM-dd HH:mm",
  timezone: FormatTimezone.contact,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  // Default resolver anchors formatting in Asia/Ho_Chi_Minh (UTC+7).
  mocks.createSourceTimezoneResolver.mockReturnValue(async () =>
    Promise.resolve("Asia/Ho_Chi_Minh"),
  )
})

describe("formatDate step handler", () => {
  test("formats the stored value in the resolved source zone and writes via setValues", async () => {
    mocks.contactCustomFieldFindValue.mockResolvedValue(
      "2026-07-23T02:30:00.000Z",
    )
    mocks.customFieldFindFirst.mockResolvedValue({ type: "text" })

    await formatDate(props(step()))

    // 02:30 UTC rendered in UTC+7 is 09:30 local.
    expect(mocks.setValues).toHaveBeenCalledTimes(1)
    expect(mocks.setValues).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      fields: [{ customFieldId: "out-field", value: "2026-07-23 09:30" }],
    })
  })

  test("maps the contact timezone choice to the ContactThenWorkspace strategy", async () => {
    mocks.contactCustomFieldFindValue.mockResolvedValue(
      "2026-07-23T02:30:00.000Z",
    )
    mocks.customFieldFindFirst.mockResolvedValue({ type: "text" })

    await formatDate(props(step({ timezone: FormatTimezone.contact })))

    expect(mocks.createSourceTimezoneResolver).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      strategy: SourceTimezoneStrategy.ContactThenWorkspace,
    })
  })

  test("maps the workspace timezone choice to the Workspace strategy", async () => {
    mocks.contactCustomFieldFindValue.mockResolvedValue(
      "2026-07-23T02:30:00.000Z",
    )
    mocks.customFieldFindFirst.mockResolvedValue({ type: "text" })

    await formatDate(props(step({ timezone: FormatTimezone.workspace })))

    expect(mocks.createSourceTimezoneResolver).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: SourceTimezoneStrategy.Workspace }),
    )
  })

  test("skips writing when the output field is temporal (would corrupt the stored value)", async () => {
    mocks.contactCustomFieldFindValue.mockResolvedValue(
      "2026-07-23T02:30:00.000Z",
    )
    mocks.customFieldFindFirst.mockResolvedValue({ type: "datetime" })

    await formatDate(props(step()))

    expect(mocks.createSourceTimezoneResolver).not.toHaveBeenCalled()
    expect(mocks.setValues).not.toHaveBeenCalled()
  })

  test("returns early without writing when the input field has no value", async () => {
    mocks.contactCustomFieldFindValue.mockResolvedValue(undefined)

    await formatDate(props(step()))

    expect(mocks.customFieldFindFirst).not.toHaveBeenCalled()
    expect(mocks.setValues).not.toHaveBeenCalled()
  })

  test("returns early without writing when the output field does not exist", async () => {
    mocks.contactCustomFieldFindValue.mockResolvedValue(
      "2026-07-23T02:30:00.000Z",
    )
    mocks.customFieldFindFirst.mockResolvedValue(undefined)

    await formatDate(props(step()))

    expect(mocks.createSourceTimezoneResolver).not.toHaveBeenCalled()
    expect(mocks.setValues).not.toHaveBeenCalled()
  })

  test("rejects a temporal Account Field (bot field) output the same as a temporal custom field", async () => {
    mocks.contactCustomFieldFindValue.mockResolvedValue(
      "2026-07-23T02:30:00.000Z",
    )
    mocks.botFieldFind.mockResolvedValue({ id: "9", type: "datetime" })

    await formatDate(props(step({ outputFieldId: "bot_field:9" })))

    expect(mocks.createSourceTimezoneResolver).not.toHaveBeenCalled()
    expect(mocks.setValues).not.toHaveBeenCalled()
    expect(mocks.setValueByKey).not.toHaveBeenCalled()
  })

  test("reads the input value from a bot field and writes the formatted string to a non-temporal bot field output via setValueByKey", async () => {
    mocks.botFieldFindByKey.mockResolvedValue({
      value: "2026-07-23T02:30:00.000Z",
    })
    mocks.botFieldFind.mockResolvedValue({ id: "5", type: "shortText" })

    await formatDate(
      props(
        step({ inputFieldId: "bot_field:3", outputFieldId: "bot_field:5" }),
      ),
    )

    expect(mocks.botFieldFindByKey).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      key: "3",
    })
    expect(mocks.setValueByKey).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      keyword: "bot_field:5",
      value: "2026-07-23 09:30",
      allowBotFields: true,
    })
    expect(mocks.setValues).not.toHaveBeenCalled()
  })

  test("logs and swallows a failing bot-field output write instead of throwing", async () => {
    mocks.contactCustomFieldFindValue.mockResolvedValue(
      "2026-07-23T02:30:00.000Z",
    )
    mocks.botFieldFind.mockResolvedValue({ id: "9", type: "shortText" })
    mocks.setValueByKey.mockRejectedValueOnce(new Error("Bot field not found"))

    await expect(
      formatDate(props(step({ outputFieldId: "bot_field:9" }))),
    ).resolves.toBeUndefined()

    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
  })
})
