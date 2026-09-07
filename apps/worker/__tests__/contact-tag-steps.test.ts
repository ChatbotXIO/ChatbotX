import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// These tests cover OUR orchestration logic in the flow-step handlers
// `addContactTag` / `removeContactTag` / `addContactSequence` (apps/worker/
// src/integration/handlers/contact.ts): they now delegate the actual
// tag-attach/detach and sequence-enrollment work to the business services
// (`tagService.attachByNamesToContacts` / `detachByNamesFromContacts`,
// `contactSequenceService.enrollFromFlow`), so these tests verify the
// handlers pass the right arguments through — not the underlying DB/enqueue
// mechanics, which are covered by the business package's own tests.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/business
// ---------------------------------------------------------------------------
const removeContactSequencesForContact = vi.fn(() => {
  order.push("remove-sequence")
})
const enrollFromFlow = vi.fn(async () => undefined)
const attachByNamesToContacts = vi.fn(async () => ({
  processedContactIds: [],
  skippedContactIds: [],
}))
const detachByNamesFromContacts = vi.fn(async () => undefined)
const setBroadcastSubscription = vi.fn(async () => ({ id: "c-1" }))

const order: string[] = []

vi.mock("@chatbotx.io/business", () => ({
  tagService: { attachByNamesToContacts, detachByNamesFromContacts },
  contactService: { setBroadcastSubscription },
}))

vi.mock("@chatbotx.io/business/contact-sequence", () => ({
  contactSequenceService: {
    removeContactSequencesForContact,
    enrollFromFlow,
  },
}))

// This suite never exercises `setContactCustomField` (the only handler that
// touches `contactVariableService`), but the real `@chatbotx.io/variables`
// transitively needs the real schema, conflicting with the narrow mock above.
vi.mock("@chatbotx.io/variables", () => ({
  contactVariableService: { getAll: vi.fn(), replaceAll: vi.fn() },
}))

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/events
// ---------------------------------------------------------------------------
const emitContactUnsubscribed = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/events", () => ({
  emitContactUnsubscribed,
}))

// ---------------------------------------------------------------------------
// Import handlers under test (after all vi.mock calls)
// ---------------------------------------------------------------------------
const {
  addContactSequence,
  addContactTag,
  removeContactSequence,
  removeContactTag,
  subscribeBroadcast,
  unsubscribeBroadcast,
} = await import("../src/integration/handlers/contact")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function addProps(
  tags: string[],
  workspaceId = "ws-1",
  contactId = "c-1",
  contactInbox?: { id: string; inboxId: string; channel: string },
) {
  return {
    conversation: { workspaceId, contactId },
    step: { tags },
    contactInbox,
  } as unknown as Parameters<typeof addContactTag>[0]
}

function removeProps(
  tags: string[],
  workspaceId = "ws-1",
  contactId = "c-1",
  contactInbox?: { id: string; inboxId: string; channel: string },
) {
  return {
    conversation: { workspaceId, contactId },
    step: { tags },
    contactInbox,
  } as unknown as Parameters<typeof removeContactTag>[0]
}

function removeSequenceProps(
  sequenceId: string | null = "seq-1",
  workspaceId = "ws-1",
  contactId = "c-1",
) {
  return {
    conversation: { workspaceId, contactId },
    contactInbox: { id: "ci-1" },
    step: { sequenceId },
  } as unknown as Parameters<typeof removeContactSequence>[0]
}

function addSequenceProps(
  sequenceId: string | null = "seq-1",
  workspaceId = "ws-1",
  contactId = "c-1",
) {
  return {
    conversation: { workspaceId, contactId },
    contactInbox: { id: "ci-1" },
    step: { sequenceId },
  } as unknown as Parameters<typeof addContactSequence>[0]
}

function unsubscribeBroadcastProps(workspaceId = "ws-1", contactId = "c-1") {
  return {
    conversation: { workspaceId, contactId },
    contactInbox: { id: "ci-1" },
  } as unknown as Parameters<typeof unsubscribeBroadcast>[0]
}

function subscribeBroadcastProps(workspaceId = "ws-1", contactId = "c-1") {
  return {
    conversation: { workspaceId, contactId },
  } as unknown as Parameters<typeof subscribeBroadcast>[0]
}

function reset() {
  order.length = 0
  vi.clearAllMocks()
  removeContactSequencesForContact.mockImplementation(() => {
    order.push("remove-sequence")
  })
}

// ============================================================================
// removeContactSequence
// ============================================================================
describe("removeContactSequence", () => {
  beforeEach(reset)

  test("delegates unsubscribe removal to the business service", async () => {
    await removeContactSequence(removeSequenceProps())

    expect(removeContactSequencesForContact).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      sequenceIds: ["seq-1"],
      reason: "unsubscribed_via_flow",
      contactInboxId: "ci-1",
    })
  })

  test("returns early when sequenceId is missing", async () => {
    await removeContactSequence(removeSequenceProps(null))

    expect(removeContactSequencesForContact).not.toHaveBeenCalled()
  })
})

// ============================================================================
// addContactSequence
// ============================================================================
describe("addContactSequence", () => {
  beforeEach(reset)

  test("delegates enrollment to contactSequenceService.enrollFromFlow", async () => {
    await addContactSequence(addSequenceProps())

    expect(enrollFromFlow).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      sequenceId: "seq-1",
      contactInboxId: "ci-1",
    })
  })

  test("returns early when sequenceId is missing, without calling the service", async () => {
    await addContactSequence(addSequenceProps(null))

    expect(enrollFromFlow).not.toHaveBeenCalled()
  })
})

// ============================================================================
// subscribeBroadcast
// ============================================================================
describe("subscribeBroadcast", () => {
  beforeEach(reset)

  test("delegates to contactService.setBroadcastSubscription with subscribed:true", async () => {
    await subscribeBroadcast(subscribeBroadcastProps())

    expect(setBroadcastSubscription).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "c-1",
      subscribed: true,
    })
  })
})

// ============================================================================
// unsubscribeBroadcast
// ============================================================================
describe("unsubscribeBroadcast", () => {
  beforeEach(reset)

  test("delegates to contactService.setBroadcastSubscription and emits contact unsubscribed event", async () => {
    await unsubscribeBroadcast(unsubscribeBroadcastProps())

    expect(setBroadcastSubscription).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      id: "c-1",
      subscribed: false,
    })
    expect(emitContactUnsubscribed).toHaveBeenCalledWith("ws-1", "c-1", "ci-1")
  })
})

// ============================================================================
// addContactTag
// ============================================================================
describe("addContactTag", () => {
  beforeEach(reset)

  test("delegates to tagService.attachByNamesToContacts with the resolved workspaceId/contactId", async () => {
    await addContactTag(addProps(["alpha", "beta"]))

    expect(attachByNamesToContacts).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactIds: ["c-1"],
      names: ["alpha", "beta"],
      contactInbox: undefined,
      emitFor: "newlyLinked",
    })
  })

  test("forwards the contactInbox for the ads-conversion trigger scope", async () => {
    await addContactTag(
      addProps(["alpha"], "ws-1", "c-1", {
        id: "ci-1",
        inboxId: "inbox-1",
        channel: "whatsapp",
      }),
    )

    expect(attachByNamesToContacts).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactIds: ["c-1"],
      names: ["alpha"],
      contactInbox: { id: "ci-1", inboxId: "inbox-1", channel: "whatsapp" },
      emitFor: "newlyLinked",
    })
  })

  test("passes emitFor:'newlyLinked' so replaying an Add-Tag node doesn't re-fire triggers for tags already on the contact", async () => {
    await addContactTag(addProps(["alpha"]))

    expect(attachByNamesToContacts).toHaveBeenCalledWith(
      expect.objectContaining({ emitFor: "newlyLinked" }),
    )
  })

  test("uses workspaceId and contactId from the conversation", async () => {
    await addContactTag(addProps(["alpha"], "ws-42", "c-77"))

    expect(attachByNamesToContacts).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-42", contactIds: ["c-77"] }),
    )
  })
})

// ============================================================================
// removeContactTag
// ============================================================================
describe("removeContactTag", () => {
  beforeEach(reset)

  test("delegates to tagService.detachByNamesFromContacts with the resolved workspaceId/contactId", async () => {
    await removeContactTag(removeProps(["alpha", "beta"]))

    expect(detachByNamesFromContacts).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactIds: ["c-1"],
      names: ["alpha", "beta"],
      contactInboxId: undefined,
    })
  })

  test("forwards the contactInbox id for the tagRemoved event scope", async () => {
    await removeContactTag(
      removeProps(["alpha"], "ws-1", "c-1", {
        id: "ci-1",
        inboxId: "inbox-1",
        channel: "whatsapp",
      }),
    )

    expect(detachByNamesFromContacts).toHaveBeenCalledWith(
      expect.objectContaining({ contactInboxId: "ci-1" }),
    )
  })

  test("uses workspaceId and contactId from the conversation", async () => {
    await removeContactTag(removeProps(["alpha"], "ws-7", "c-9"))

    expect(detachByNamesFromContacts).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "ws-7", contactIds: ["c-9"] }),
    )
  })
})
