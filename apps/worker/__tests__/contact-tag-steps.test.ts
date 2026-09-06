import { beforeEach, describe, expect, test, vi } from "vitest"

// ---------------------------------------------------------------------------
// These tests cover OUR orchestration logic in the flow-step handlers
// `addContactTag` / `removeContactTag` (apps/worker/src/integration/handlers/
// contact.ts): they must enqueue tag-sync jobs (enqueueAttach / enqueueDetach)
// and emit tag events for the correct set of tags. We do NOT test the channel
// APIs — only that we enqueue/emit with the right payloads.
//
// The refactor moved all direct db access behind @chatbotx.io/business
// services (tagService.attachByNamesToContact / listIdsByNames /
// detachTagIdsFromContact, contactSequenceService.*, contactService.*), so
// these tests now mock that service boundary instead of the db client.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mutable state holders controlled per-test
// ---------------------------------------------------------------------------
const state = {
  // addContactTag: tagService.attachByNamesToContact returns ONLY newly-linked tag ids
  newlyLinkedTagIds: [] as string[],
  // removeContactTag: tagService.listIdsByNames resolved tag rows
  tagFindMany: [] as { id: string }[],
  existingSequenceEnrollment: null as { id: string } | null,
  firstSequenceStep: null as {
    delayDays: number
    delayMinutes: number
    id: string
  } | null,
  sequenceName: undefined as string | undefined,
}

// Records the relative order of side effects (attach vs enqueue)
const order: string[] = []

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/business
// ---------------------------------------------------------------------------
const attachByNamesToContact = vi.fn(() => {
  order.push("tx-done")
  return Promise.resolve(state.newlyLinkedTagIds)
})
const listIdsByNames = vi.fn(() => Promise.resolve(state.tagFindMany))
const detachTagIdsFromContact = vi.fn(() => {
  order.push("delete")
  return Promise.resolve()
})
const removeContactSequencesForContact = vi.fn(() => {
  order.push("remove-sequence")
})
const enqueueAttach = vi.fn(() => {
  order.push("enqueue")
})
const enqueueDetach = vi.fn(() => {
  order.push("enqueue")
})
const enqueueTagAppliedEvaluationsForInbox = vi.fn(async () => undefined)
const subscribeBroadcastIfUnsubscribed = vi.fn(async () => undefined)
const unsubscribeBroadcastMock = vi.fn(async () => undefined)
const isEnrolled = vi.fn(async () => Boolean(state.existingSequenceEnrollment))
const findFirstActiveStep = vi.fn(
  async () => state.firstSequenceStep ?? undefined,
)
const findSequenceName = vi.fn(async () => state.sequenceName)

vi.mock("@chatbotx.io/business", () => ({
  tagService: {
    attachByNamesToContact: (...args: unknown[]) =>
      attachByNamesToContact(...args),
    listIdsByNames: (...args: unknown[]) => listIdsByNames(...args),
    detachTagIdsFromContact: (...args: unknown[]) =>
      detachTagIdsFromContact(...args),
  },
  tagSyncService: { enqueueAttach, enqueueDetach },
  adsConversionService: {
    isEligibleChannel: (channel: string | null | undefined) =>
      channel === "whatsapp",
    enqueueTagAppliedEvaluationsForInbox: (...args: unknown[]) =>
      enqueueTagAppliedEvaluationsForInbox(...args),
  },
  contactService: {
    subscribeBroadcastIfUnsubscribed: (...args: unknown[]) =>
      subscribeBroadcastIfUnsubscribed(...args),
    unsubscribeBroadcast: (...args: unknown[]) =>
      unsubscribeBroadcastMock(...args),
  },
}))

vi.mock("@chatbotx.io/business/contact-sequence", () => ({
  contactSequenceService: {
    removeContactSequencesForContact,
    isEnrolled: (...args: unknown[]) => isEnrolled(...args),
    findFirstActiveStep: (...args: unknown[]) => findFirstActiveStep(...args),
    findSequenceName: (...args: unknown[]) => findSequenceName(...args),
  },
}))

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/events
// ---------------------------------------------------------------------------
const emitTagApplied = vi.fn(async () => undefined)
const emitTagRemoved = vi.fn(async () => undefined)
const emitCustomFieldChanged = vi.fn(async () => undefined)
const emitContactUnsubscribed = vi.fn(async () => undefined)
const emitSequenceSubscribed = vi.fn(async () => undefined)
vi.mock("@chatbotx.io/events", () => ({
  emitTagApplied,
  emitTagRemoved,
  emitCustomFieldChanged,
  emitContactUnsubscribed,
  emitSequenceSubscribed,
}))

// ---------------------------------------------------------------------------
// Remaining runtime imports of contact.ts (unused by tested handlers)
// ---------------------------------------------------------------------------
vi.mock("@chatbotx.io/event-bus", () => ({ emit: vi.fn() }))
const { enrollContactInSequenceMock } = vi.hoisted(() => ({
  enrollContactInSequenceMock: vi.fn(),
}))
vi.mock("@chatbotx.io/sequence-scheduler", () => ({
  enrollContactInSequence: enrollContactInSequenceMock,
}))

let idCounter = 0
vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: vi.fn(() => `generated-id-${++idCounter}`),
  }
})

// ---------------------------------------------------------------------------
// Import handlers under test (after all vi.mock calls)
// ---------------------------------------------------------------------------
const {
  addContactSequence,
  addContactTag,
  removeContactSequence,
  removeContactTag,
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

function reset() {
  state.newlyLinkedTagIds = []
  state.tagFindMany = []
  state.existingSequenceEnrollment = null
  state.firstSequenceStep = null
  state.sequenceName = undefined
  order.length = 0
  idCounter = 0
  vi.clearAllMocks()
  // Re-wire implementations (clearAllMocks resets mockImplementation)
  attachByNamesToContact.mockImplementation(() => {
    order.push("tx-done")
    return Promise.resolve(state.newlyLinkedTagIds)
  })
  listIdsByNames.mockImplementation(() => Promise.resolve(state.tagFindMany))
  detachTagIdsFromContact.mockImplementation(() => {
    order.push("delete")
    return Promise.resolve()
  })
  removeContactSequencesForContact.mockImplementation(() => {
    order.push("remove-sequence")
  })
  enqueueAttach.mockImplementation(() => {
    order.push("enqueue")
  })
  enqueueDetach.mockImplementation(() => {
    order.push("enqueue")
  })
  enqueueTagAppliedEvaluationsForInbox.mockReset()
  enqueueTagAppliedEvaluationsForInbox.mockResolvedValue(undefined)
  subscribeBroadcastIfUnsubscribed.mockResolvedValue(undefined)
  unsubscribeBroadcastMock.mockResolvedValue(undefined)
  isEnrolled.mockImplementation(async () =>
    Boolean(state.existingSequenceEnrollment),
  )
  findFirstActiveStep.mockImplementation(
    async () => state.firstSequenceStep ?? undefined,
  )
  findSequenceName.mockImplementation(async () => state.sequenceName)
  enrollContactInSequenceMock.mockResolvedValue(undefined)
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
    expect(order).toEqual([])
  })
})

// ============================================================================
// addContactSequence
// ============================================================================
describe("addContactSequence", () => {
  beforeEach(reset)

  test("enrolls and emits subscribed event after successful enrollment", async () => {
    state.firstSequenceStep = {
      id: "step-1",
      delayDays: 1,
      delayMinutes: 30,
    }
    state.sequenceName = "Welcome"

    await addContactSequence(addSequenceProps())

    expect(enrollContactInSequenceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "ws-1",
        contactId: "c-1",
        sequenceId: "seq-1",
        nextStepId: "step-1",
      }),
    )
    expect(emitSequenceSubscribed).toHaveBeenCalledWith(
      "ws-1",
      "c-1",
      "seq-1",
      "Welcome",
      "ci-1",
    )
  })

  test("does not emit when contact is already enrolled", async () => {
    state.existingSequenceEnrollment = { id: "enrollment-1" }

    await addContactSequence(addSequenceProps())

    expect(enrollContactInSequenceMock).not.toHaveBeenCalled()
    expect(emitSequenceSubscribed).not.toHaveBeenCalled()
  })
})

// ============================================================================
// unsubscribeBroadcast
// ============================================================================
describe("unsubscribeBroadcast", () => {
  beforeEach(reset)

  test("updates contact and emits contact unsubscribed event", async () => {
    await unsubscribeBroadcast(unsubscribeBroadcastProps())

    expect(unsubscribeBroadcastMock).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
    })
    expect(emitContactUnsubscribed).toHaveBeenCalledWith("ws-1", "c-1", "ci-1")
  })
})

// ============================================================================
// addContactTag
// ============================================================================
describe("addContactTag", () => {
  beforeEach(reset)

  test("enqueues attach + emits applied only for newly-linked pairs", async () => {
    // Only tag-1 was newly linked; tag-2 already existed on the contact
    state.newlyLinkedTagIds = ["tag-1"]

    await addContactTag(addProps(["alpha", "beta"]))

    expect(attachByNamesToContact).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      names: ["alpha", "beta"],
    })

    expect(enqueueAttach).toHaveBeenCalledTimes(1)
    expect(enqueueAttach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-1",
    })
    expect(enqueueAttach).not.toHaveBeenCalledWith(
      expect.objectContaining({ tagId: "tag-2" }),
    )

    expect(emitTagApplied).toHaveBeenCalledTimes(1)
    expect(emitTagApplied).toHaveBeenCalledWith(
      "ws-1",
      "c-1",
      "tag-1",
      undefined,
    )
  })

  test("does NOT enqueue or emit when all pairs already exist (empty newly-linked result)", async () => {
    state.newlyLinkedTagIds = []

    await addContactTag(addProps(["alpha"]))

    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(emitTagApplied).not.toHaveBeenCalled()
  })

  test("does NOT enqueue or emit when no tags resolve in the workspace", async () => {
    state.newlyLinkedTagIds = []

    await addContactTag(addProps(["ghost"]))

    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(emitTagApplied).not.toHaveBeenCalled()
  })

  test("enqueues attach AFTER the service call resolves (not before)", async () => {
    state.newlyLinkedTagIds = ["tag-1"]

    await addContactTag(addProps(["alpha"]))

    expect(order).toEqual(["tx-done", "enqueue"])
  })

  test("uses workspaceId and contactId from the conversation", async () => {
    state.newlyLinkedTagIds = ["tag-9"]

    await addContactTag(addProps(["alpha"], "ws-42", "c-77"))

    expect(enqueueAttach).toHaveBeenCalledWith({
      workspaceId: "ws-42",
      contactId: "c-77",
      tagId: "tag-9",
    })
    expect(emitTagApplied).toHaveBeenCalledWith(
      "ws-42",
      "c-77",
      "tag-9",
      undefined,
    )
  })

  test("enqueues the ads conversion tagApplied evaluation when a WhatsApp contactInbox is in scope", async () => {
    state.newlyLinkedTagIds = ["tag-1"]

    await addContactTag(
      addProps(["alpha"], "ws-1", "c-1", {
        id: "ci-1",
        inboxId: "inbox-1",
        channel: "whatsapp",
      }),
    )

    expect(enqueueTagAppliedEvaluationsForInbox).toHaveBeenCalledTimes(1)
    expect(enqueueTagAppliedEvaluationsForInbox).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      channel: "whatsapp",
      inboxId: "inbox-1",
      contactInboxId: "ci-1",
      tagIds: ["tag-1"],
    })
  })

  test("does NOT enqueue the ads conversion evaluation without a contactInbox in scope", async () => {
    state.newlyLinkedTagIds = ["tag-1"]

    await addContactTag(addProps(["alpha"]))

    expect(enqueueTagAppliedEvaluationsForInbox).not.toHaveBeenCalled()
  })

  test("does NOT enqueue the ads conversion evaluation for a non-WhatsApp contactInbox", async () => {
    state.newlyLinkedTagIds = ["tag-1"]

    await addContactTag(
      addProps(["alpha"], "ws-1", "c-1", {
        id: "ci-1",
        inboxId: "inbox-1",
        channel: "messenger",
      }),
    )

    expect(enqueueTagAppliedEvaluationsForInbox).not.toHaveBeenCalled()
  })

  test("does NOT enqueue the ads conversion evaluation when no tags were newly linked", async () => {
    state.newlyLinkedTagIds = []

    await addContactTag(
      addProps(["alpha"], "ws-1", "c-1", {
        id: "ci-1",
        inboxId: "inbox-1",
        channel: "whatsapp",
      }),
    )

    expect(enqueueTagAppliedEvaluationsForInbox).not.toHaveBeenCalled()
  })
})

// ============================================================================
// removeContactTag
// ============================================================================
describe("removeContactTag", () => {
  beforeEach(reset)

  test("returns early when no tag names resolve (no delete/enqueue/emit)", async () => {
    state.tagFindMany = []

    await removeContactTag(removeProps(["ghost"]))

    expect(detachTagIdsFromContact).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
    expect(emitTagRemoved).not.toHaveBeenCalled()
  })

  test("deletes once and enqueues detach + emits removed per resolved tag", async () => {
    state.tagFindMany = [{ id: "tag-1" }, { id: "tag-2" }]

    await removeContactTag(removeProps(["alpha", "beta"]))

    expect(detachTagIdsFromContact).toHaveBeenCalledTimes(1)
    expect(detachTagIdsFromContact).toHaveBeenCalledWith({
      contactId: "c-1",
      tagIds: ["tag-1", "tag-2"],
    })

    expect(enqueueDetach).toHaveBeenCalledTimes(2)
    expect(enqueueDetach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-1",
    })
    expect(enqueueDetach).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      contactId: "c-1",
      tagId: "tag-2",
    })

    expect(emitTagRemoved).toHaveBeenCalledTimes(2)
    expect(emitTagRemoved).toHaveBeenCalledWith(
      "ws-1",
      "c-1",
      "tag-1",
      undefined,
    )
    expect(emitTagRemoved).toHaveBeenCalledWith(
      "ws-1",
      "c-1",
      "tag-2",
      undefined,
    )
  })

  test("uses workspaceId and contactId from the conversation", async () => {
    state.tagFindMany = [{ id: "tag-5" }]

    await removeContactTag(removeProps(["alpha"], "ws-7", "c-9"))

    expect(enqueueDetach).toHaveBeenCalledWith({
      workspaceId: "ws-7",
      contactId: "c-9",
      tagId: "tag-5",
    })
  })
})
