import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// Covers the flow-step handler `clearContactCustomField` (apps/worker/src/
// integration/handlers/contact.ts): it must thread the step's contactInbox
// id into contactCustomFieldService.deleteByKey so the customFieldValueChanged
// Trigger event it emits attributes to the conversation's own channel.
// ---------------------------------------------------------------------------

const deleteByKey = vi.fn(async () => undefined)

vi.mock("@chatbotx.io/business", () => ({
  contactCustomFieldService: { deleteByKey },
  contactService: { delete: vi.fn() },
  tagSyncService: { enqueueAttach: vi.fn(), enqueueDetach: vi.fn() },
}))

vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: {
    getAll: vi.fn(async () => ({})),
    replaceAll: vi.fn(async ({ text }: { text: string }) => text),
  },
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

const { clearContactCustomField } = await import(
  "../src/integration/handlers/contact"
)

type Step = { inputFieldId: string }

function props(step: Step, workspaceId = "ws-1", contactId = "c-1") {
  return {
    conversation: { workspaceId, contactId },
    contactInbox: { id: "ci-1" },
    step,
  } as unknown as Parameters<typeof clearContactCustomField>[0]
}

describe("clearContactCustomField", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test("threads the step's conversation-scoped contactInbox id into deleteByKey", async () => {
    await clearContactCustomField(props({ inputFieldId: "42" }))

    expect(deleteByKey).toHaveBeenCalledTimes(1)
    expect(deleteByKey).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      keyword: "42",
      contactInboxId: "ci-1",
    })
  })

  test("uses workspaceId and contactId from the conversation, and the id of whichever contactInbox is in scope", async () => {
    await clearContactCustomField(
      props({ inputFieldId: "greeting" }, "ws-42", "c-77"),
    )

    expect(deleteByKey).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-42",
        contactId: "c-77",
        contactInboxId: "ci-1",
      }),
    )
  })
})
