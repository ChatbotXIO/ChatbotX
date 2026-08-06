import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Covers the flow-step handler `setContactCustomField` (apps/worker/src/
// integration/handlers/contact.ts): it must forward the step's captured editor
// timezone, lenient parsing, and the empty->now flag into the business service.
// The worker has no browser context, so this threading is what lets a naive
// date/datetime value be anchored (and a blank one stamped "now") at runtime.
// We mock ONLY the boundaries; `@chatbotx.io/utils/datetime` is left real so
// the asserted `TemporalInputParsing.Lenient` is the genuine enum value.
// ---------------------------------------------------------------------------

const setValueByKey = vi.fn(async () => undefined)

vi.mock("@chatbotx.io/business", () => ({
  contactCustomFieldService: { setValueByKey },
  contactService: { delete: vi.fn() },
  tagSyncService: { enqueueAttach: vi.fn(), enqueueDetach: vi.fn() },
}))

// The handler now resolves {{variable}} tokens in the value before persisting.
// Mock the boundary: `getAll` returns an opaque context, `replaceAll` is an
// identity by default so plain literals pass through unchanged; individual
// tests override `replaceAll` to assert the resolved value is what gets stored.
const getAllVariables = vi.fn(async () => ({}) as unknown)
const replaceAll = vi.fn(async ({ text }: { text: string }) => text)

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: { getAll: getAllVariables, replaceAll },
}))

vi.mock("@chatbotx.io/business/contact-sequence", () => ({
  contactSequenceService: { removeContactSequencesForContact: vi.fn() },
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {},
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: [col, vals] }),
  isNull: (col: unknown) => ({ isNull: col }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactModel: {},
  contactNoteModel: {},
  contactsToTagsModel: {},
  tagModel: {},
}))

vi.mock("@chatbotx.io/event-bus", () => ({ emit: vi.fn() }))

vi.mock("@chatbotx.io/events", () => ({
  emitContactUnsubscribed: vi.fn(),
  emitSequenceSubscribed: vi.fn(),
  emitTagApplied: vi.fn(),
  emitTagRemoved: vi.fn(),
}))

vi.mock("@chatbotx.io/sequence-scheduler", () => ({
  enrollContactInSequence: vi.fn(),
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return { ...actual, createId: vi.fn(() => "generated-id") }
})

// ---------------------------------------------------------------------------
// Import handler under test (after all vi.mock calls)
// ---------------------------------------------------------------------------
const { setContactCustomField } = await import(
  "../src/integration/handlers/contact"
)

type Step = {
  inputFieldId: string
  value: string
  timezone?: string
}

function props(step: Step, workspaceId = "ws-1", contactId = "c-1") {
  return {
    conversation: { workspaceId, contactId },
    contactInbox: { id: "ci-1" },
    step,
  } as unknown as Parameters<typeof setContactCustomField>[0]
}

describe("setContactCustomField", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("threads the captured editor timezone, lenient parsing, and empty->now flag", async () => {
    await setContactCustomField(
      props({
        inputFieldId: "42",
        value: "23/07/2026 09:30",
        timezone: "Asia/Ho_Chi_Minh",
      }),
    )

    expect(setValueByKey).toHaveBeenCalledTimes(1)
    expect(setValueByKey).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      keyword: "42",
      value: "23/07/2026 09:30",
      sourceTimezoneOverride: "Asia/Ho_Chi_Minh",
      temporalInputParsing: "lenient",
      fillEmptyTemporalWithNow: true,
    })
  })

  test("forwards a blank value so the service stamps 'now'", async () => {
    await setContactCustomField(
      props({ inputFieldId: "date_field", value: "", timezone: "UTC" }),
    )

    expect(setValueByKey).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: "date_field",
        value: "",
        fillEmptyTemporalWithNow: true,
      }),
    )
  })

  test("resolves {{variable}} tokens in the value before persisting", async () => {
    replaceAll.mockResolvedValueOnce("Hello Jane")

    await setContactCustomField(
      props({ inputFieldId: "greeting", value: "Hello {{first_name}}" }),
    )

    // The raw token string is handed to the resolver...
    expect(replaceAll).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Hello {{first_name}}" }),
    )
    // ...and the resolved output — not the raw tokens — is what gets stored.
    expect(setValueByKey).toHaveBeenCalledWith(
      expect.objectContaining({ keyword: "greeting", value: "Hello Jane" }),
    )
  })

  test("passes an undefined timezone through for legacy steps (no regression)", async () => {
    // Steps saved before this feature carry no `timezone`; the override must
    // arrive undefined so the service falls back to the contact/workspace zone.
    await setContactCustomField(props({ inputFieldId: "7", value: "hello" }))

    expect(setValueByKey).toHaveBeenCalledWith(
      expect.objectContaining({ sourceTimezoneOverride: undefined }),
    )
  })
})
