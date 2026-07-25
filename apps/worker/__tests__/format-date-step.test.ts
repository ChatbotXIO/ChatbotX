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
  contactCustomFieldFindFirst: vi.fn(),
  customFieldFindFirst: vi.fn(),
  createSourceTimezoneResolver: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  customFieldService: { findBy: mocks.customFieldFindFirst },
  contactCustomFieldService: { setValues: mocks.setValues },
  externalRequestService: {},
}))

vi.mock("@chatbotx.io/business/contact-custom-field", () => ({
  createSourceTimezoneResolver: mocks.createSourceTimezoneResolver,
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      contactCustomFieldModel: { findFirst: mocks.contactCustomFieldFindFirst },
      customFieldModel: { findFirst: mocks.customFieldFindFirst },
    },
    $count: vi.fn(),
  },
  and: (...args: unknown[]) => ({ and: args }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: [col, vals] }),
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: { getAll: vi.fn() },
  extractVariables: vi.fn(() => []),
  getSystemFieldValue: vi.fn(async () => null),
  interpolate: vi.fn((text: string) => text),
  resolveContactVariablesDeep: vi.fn(async (_id, value) => value),
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
    mocks.contactCustomFieldFindFirst.mockResolvedValue({
      value: "2026-07-23T02:30:00.000Z",
    })
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
    mocks.contactCustomFieldFindFirst.mockResolvedValue({
      value: "2026-07-23T02:30:00.000Z",
    })
    mocks.customFieldFindFirst.mockResolvedValue({ type: "text" })

    await formatDate(props(step({ timezone: FormatTimezone.contact })))

    expect(mocks.createSourceTimezoneResolver).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      strategy: SourceTimezoneStrategy.ContactThenWorkspace,
    })
  })

  test("maps the workspace timezone choice to the Workspace strategy", async () => {
    mocks.contactCustomFieldFindFirst.mockResolvedValue({
      value: "2026-07-23T02:30:00.000Z",
    })
    mocks.customFieldFindFirst.mockResolvedValue({ type: "text" })

    await formatDate(props(step({ timezone: FormatTimezone.workspace })))

    expect(mocks.createSourceTimezoneResolver).toHaveBeenCalledWith(
      expect.objectContaining({ strategy: SourceTimezoneStrategy.Workspace }),
    )
  })

  test("skips writing when the output field is temporal (would corrupt the stored value)", async () => {
    mocks.contactCustomFieldFindFirst.mockResolvedValue({
      value: "2026-07-23T02:30:00.000Z",
    })
    mocks.customFieldFindFirst.mockResolvedValue({ type: "datetime" })

    await formatDate(props(step()))

    expect(mocks.createSourceTimezoneResolver).not.toHaveBeenCalled()
    expect(mocks.setValues).not.toHaveBeenCalled()
  })

  test("returns early without writing when the input field has no value", async () => {
    mocks.contactCustomFieldFindFirst.mockResolvedValue(undefined)

    await formatDate(props(step()))

    expect(mocks.customFieldFindFirst).not.toHaveBeenCalled()
    expect(mocks.setValues).not.toHaveBeenCalled()
  })

  test("returns early without writing when the output field does not exist", async () => {
    mocks.contactCustomFieldFindFirst.mockResolvedValue({
      value: "2026-07-23T02:30:00.000Z",
    })
    mocks.customFieldFindFirst.mockResolvedValue(undefined)

    await formatDate(props(step()))

    expect(mocks.createSourceTimezoneResolver).not.toHaveBeenCalled()
    expect(mocks.setValues).not.toHaveBeenCalled()
  })
})
