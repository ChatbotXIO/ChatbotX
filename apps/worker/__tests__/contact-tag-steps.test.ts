import { beforeEach, describe, expect, test, vi } from "vitest"
import { z } from "zod"

// ---------------------------------------------------------------------------
// These tests cover OUR orchestration logic in the flow-step handlers
// `addContactTag` / `removeContactTag` (apps/worker/src/integration/handlers/
// contact.ts): they must enqueue tag-sync jobs (enqueueAttach / enqueueDetach)
// and emit tag events for the correct set of tags. We do NOT test the channel
// APIs — only that we enqueue/emit with the right payloads.
// Mock pattern mirrors sync-tag.test.ts + contact-tag-actions.test.ts.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mutable state holders controlled per-test
// ---------------------------------------------------------------------------
const state = {
  // addContactTag
  txExistingTags: [] as { id: string }[], // tx.select().from(tagModel).where()
  txNewlyLinked: [] as { tagId: string }[], // contactsToTags insert .returning()
  // removeContactTag
  tagFindMany: [] as { id: string }[], // db.query.tagModel.findMany()
  sequenceEnrollments: [] as unknown[],
  existingSequenceEnrollment: null as { id: string } | null,
  firstSequenceStep: null as {
    delayDays: number
    delayMinutes: number
    id: string
  } | null,
  sequence: null as { name: string } | null,
}

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/database/client
// ---------------------------------------------------------------------------
const mockTxInsertBuilder = {
  values: vi.fn(),
  onConflictDoNothing: vi.fn(),
  returning: vi.fn(),
}
mockTxInsertBuilder.values.mockReturnValue(mockTxInsertBuilder)
mockTxInsertBuilder.onConflictDoNothing.mockReturnValue(mockTxInsertBuilder)
mockTxInsertBuilder.returning.mockImplementation(
  async () => state.txNewlyLinked,
)

const mockTxSelectBuilder = {
  from: vi.fn(),
  where: vi.fn(),
}
mockTxSelectBuilder.from.mockReturnValue(mockTxSelectBuilder)
mockTxSelectBuilder.where.mockImplementation(async () => state.txExistingTags)

const mockTx = {
  delete: vi.fn(() => mockDeleteBuilder),
  insert: vi.fn(() => mockTxInsertBuilder),
  select: vi.fn(() => mockTxSelectBuilder),
}

const mockDeleteBuilder = {
  where: vi.fn(),
}
mockDeleteBuilder.where.mockImplementation(() => {
  order.push("delete")
})

const mockUpdateBuilder = {
  set: vi.fn(),
  where: vi.fn(),
}
mockUpdateBuilder.set.mockReturnValue(mockUpdateBuilder)
mockUpdateBuilder.where.mockImplementation(() => {
  order.push("update")
})

// Records the relative order of side effects (transaction vs enqueue)
const order: string[] = []

const dbTransaction = vi.fn(
  async (cb: (tx: typeof mockTx) => Promise<unknown>) => {
    const result = await cb(mockTx)
    order.push("tx-done")
    return result
  },
)

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: dbTransaction,
    delete: vi.fn(() => mockDeleteBuilder),
    update: vi.fn(() => mockUpdateBuilder),
    query: {
      tagModel: {
        findMany: vi.fn(async () => state.tagFindMany),
      },
      contactsOnSequenceModel: {
        findMany: vi.fn(async () => state.sequenceEnrollments),
        findFirst: vi.fn(async () => state.existingSequenceEnrollment),
      },
      sequenceStepModel: {
        findFirst: vi.fn(async () => state.firstSequenceStep),
      },
      sequenceModel: {
        findFirst: vi.fn(async () => state.sequence),
      },
    },
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: [col, vals] }),
  isNull: (col: unknown) => ({ isNull: col }),
}))

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/database/schema — sentinel objects
// ---------------------------------------------------------------------------
// Do NOT importOriginal the real schema module here: its index pulls in the
// message sharding client, which opens a database connection at import time.
vi.mock("@chatbotx.io/database/schema", () => {
  const explicit: Record<string, unknown> = {
    tagModel: {
      id: "tagModel.id",
      name: "tagModel.name",
      workspaceId: "tagModel.workspaceId",
    },
    contactsOnSequenceModel: {
      id: "contactsOnSequenceModel.id",
      contactId: "contactsOnSequenceModel.contactId",
      sequenceId: "contactsOnSequenceModel.sequenceId",
      workspaceId: "contactsOnSequenceModel.workspaceId",
    },
    contactsToTagsModel: {
      contactId: "contactsToTagsModel.contactId",
      tagId: "contactsToTagsModel.tagId",
    },
    contactModel: {
      id: "contactModel.id",
      workspaceId: "contactModel.workspaceId",
    },
    // Real values: ads-conversion/schema.ts (pulled in transitively via
    // tag/service.ts -> ads-conversion/service.ts) uses these at module scope
    // to build Zod schemas from adsConversionRuleModel's column shape.
    createSelectSchema: (
      _table: unknown,
      refinements?: Record<string, unknown>,
    ) => z.object(refinements ?? {}),
    adsConversionChannelSchema: z.enum(["whatsapp", "facebook"]),
    adsConversionEventTypeSchema: z.enum(["lead", "purchase"]),
  }
  // The real schema index pulls in the message sharding client (opens a DB
  // connection at import), so serve `{}` sentinels for any model the wider
  // import graph touches instead of importOriginal.
  return new Proxy(explicit, {
    get: (target, prop) => (prop in target ? target[prop as string] : {}),
    has: () => true,
  })
})

// ---------------------------------------------------------------------------
// Mock: @chatbotx.io/business
// ---------------------------------------------------------------------------
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
vi.mock("@chatbotx.io/business", () => ({
  tagSyncService: { enqueueAttach, enqueueDetach },
  adsConversionService: {
    isEligibleChannel: (channel: string | null | undefined) =>
      channel === "whatsapp",
    enqueueTagAppliedEvaluationsForInbox: (...args: unknown[]) =>
      enqueueTagAppliedEvaluationsForInbox(...args),
  },
}))

vi.mock("@chatbotx.io/business/contact-sequence", () => ({
  contactSequenceService: { removeContactSequencesForContact },
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
const {
  cancelPendingDispatchesMock,
  enrollContactInSequenceMock,
  removeDispatchesFromScheduleMock,
} = vi.hoisted(() => ({
  cancelPendingDispatchesMock: vi.fn(),
  enrollContactInSequenceMock: vi.fn(),
  removeDispatchesFromScheduleMock: vi.fn(),
}))
vi.mock("@chatbotx.io/sequence-scheduler", () => ({
  cancelPendingDispatches: cancelPendingDispatchesMock,
  enrollContactInSequence: enrollContactInSequenceMock,
  removeDispatchesFromSchedule: removeDispatchesFromScheduleMock,
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

function removeProps(tags: string[], workspaceId = "ws-1", contactId = "c-1") {
  return {
    conversation: { workspaceId, contactId },
    step: { tags },
  } as unknown as Parameters<typeof removeContactTag>[0]
}

function removeSequenceProps(
  sequenceId: string | null = "seq-1",
  workspaceId = "ws-1",
  contactId = "c-1",
) {
  return {
    conversation: { workspaceId, contactId },
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
    step: { sequenceId },
  } as unknown as Parameters<typeof addContactSequence>[0]
}

function unsubscribeBroadcastProps(workspaceId = "ws-1", contactId = "c-1") {
  return {
    conversation: { workspaceId, contactId },
  } as unknown as Parameters<typeof unsubscribeBroadcast>[0]
}

function reset() {
  state.txExistingTags = []
  state.txNewlyLinked = []
  state.tagFindMany = []
  state.sequenceEnrollments = []
  state.existingSequenceEnrollment = null
  state.firstSequenceStep = null
  state.sequence = null
  order.length = 0
  idCounter = 0
  vi.clearAllMocks()
  // Re-wire chains (clearAllMocks resets mockReturnValue/Implementation)
  mockTxInsertBuilder.values.mockReturnValue(mockTxInsertBuilder)
  mockTxInsertBuilder.onConflictDoNothing.mockReturnValue(mockTxInsertBuilder)
  mockTxInsertBuilder.returning.mockImplementation(
    async () => state.txNewlyLinked,
  )
  mockTxSelectBuilder.from.mockReturnValue(mockTxSelectBuilder)
  mockTxSelectBuilder.where.mockImplementation(async () => state.txExistingTags)
  mockTx.insert.mockReturnValue(mockTxInsertBuilder)
  mockTx.select.mockReturnValue(mockTxSelectBuilder)
  mockTx.delete.mockReturnValue(mockDeleteBuilder)
  mockDeleteBuilder.where.mockImplementation(() => {
    order.push("delete")
  })
  mockUpdateBuilder.set.mockReturnValue(mockUpdateBuilder)
  mockUpdateBuilder.where.mockImplementation(() => {
    order.push("update")
  })
  cancelPendingDispatchesMock.mockImplementation(({ enrollmentId }) => {
    order.push("cancel")
    return Promise.resolve([{ id: `dispatch-${enrollmentId}`, bucket: 1 }])
  })
  removeDispatchesFromScheduleMock.mockImplementation(() => {
    order.push("remove")
  })
  enrollContactInSequenceMock.mockResolvedValue(undefined)
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
    })
    expect(cancelPendingDispatchesMock).not.toHaveBeenCalled()
    expect(removeDispatchesFromScheduleMock).not.toHaveBeenCalled()
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
    state.sequence = { name: "Welcome" }

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

    const { db } = await import("@chatbotx.io/database/client")
    expect(db.update).toHaveBeenCalled()
    expect(emitContactUnsubscribed).toHaveBeenCalledWith("ws-1", "c-1")
  })
})

// ============================================================================
// addContactTag
// ============================================================================
describe("addContactTag", () => {
  beforeEach(reset)

  test("enqueues attach + emits applied only for newly-linked pairs", async () => {
    state.txExistingTags = [{ id: "tag-1" }, { id: "tag-2" }]
    // Only tag-1 was newly linked; tag-2 already existed on the contact
    state.txNewlyLinked = [{ tagId: "tag-1" }]

    await addContactTag(addProps(["alpha", "beta"]))

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
    expect(emitTagApplied).toHaveBeenCalledWith("ws-1", "c-1", "tag-1")
  })

  test("does NOT enqueue or emit when all pairs already exist (empty RETURNING)", async () => {
    state.txExistingTags = [{ id: "tag-1" }]
    state.txNewlyLinked = []

    await addContactTag(addProps(["alpha"]))

    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(emitTagApplied).not.toHaveBeenCalled()
  })

  test("does NOT enqueue or emit when no tags resolve in the workspace", async () => {
    state.txExistingTags = []
    state.txNewlyLinked = []

    await addContactTag(addProps(["ghost"]))

    expect(enqueueAttach).not.toHaveBeenCalled()
    expect(emitTagApplied).not.toHaveBeenCalled()
  })

  test("enqueues attach AFTER the transaction commits (not inside the tx)", async () => {
    state.txExistingTags = [{ id: "tag-1" }]
    state.txNewlyLinked = [{ tagId: "tag-1" }]

    await addContactTag(addProps(["alpha"]))

    expect(order).toEqual(["tx-done", "enqueue"])
  })

  test("uses workspaceId and contactId from the conversation", async () => {
    state.txExistingTags = [{ id: "tag-9" }]
    state.txNewlyLinked = [{ tagId: "tag-9" }]

    await addContactTag(addProps(["alpha"], "ws-42", "c-77"))

    expect(enqueueAttach).toHaveBeenCalledWith({
      workspaceId: "ws-42",
      contactId: "c-77",
      tagId: "tag-9",
    })
    expect(emitTagApplied).toHaveBeenCalledWith("ws-42", "c-77", "tag-9")
  })

  test("enqueues the ads conversion tagApplied evaluation when a WhatsApp contactInbox is in scope", async () => {
    state.txExistingTags = [{ id: "tag-1" }]
    state.txNewlyLinked = [{ tagId: "tag-1" }]

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
      inboxId: "inbox-1",
      contactInboxId: "ci-1",
      tagIds: ["tag-1"],
    })
  })

  test("does NOT enqueue the ads conversion evaluation without a contactInbox in scope", async () => {
    state.txExistingTags = [{ id: "tag-1" }]
    state.txNewlyLinked = [{ tagId: "tag-1" }]

    await addContactTag(addProps(["alpha"]))

    expect(enqueueTagAppliedEvaluationsForInbox).not.toHaveBeenCalled()
  })

  test("does NOT enqueue the ads conversion evaluation for a non-WhatsApp contactInbox", async () => {
    state.txExistingTags = [{ id: "tag-1" }]
    state.txNewlyLinked = [{ tagId: "tag-1" }]

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
    state.txExistingTags = [{ id: "tag-1" }]
    state.txNewlyLinked = []

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

    const { db } = await import("@chatbotx.io/database/client")
    expect(db.delete).not.toHaveBeenCalled()
    expect(enqueueDetach).not.toHaveBeenCalled()
    expect(emitTagRemoved).not.toHaveBeenCalled()
  })

  test("deletes once and enqueues detach + emits removed per resolved tag", async () => {
    state.tagFindMany = [{ id: "tag-1" }, { id: "tag-2" }]

    await removeContactTag(removeProps(["alpha", "beta"]))

    const { db } = await import("@chatbotx.io/database/client")
    expect(db.delete).toHaveBeenCalledTimes(1)

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
    expect(emitTagRemoved).toHaveBeenCalledWith("ws-1", "c-1", "tag-1")
    expect(emitTagRemoved).toHaveBeenCalledWith("ws-1", "c-1", "tag-2")
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
