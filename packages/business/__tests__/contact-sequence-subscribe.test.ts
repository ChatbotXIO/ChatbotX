import { beforeEach, describe, expect, test, vi } from "vitest"

// contactSequenceService.subscribeContacts: sequenceIds are validated against
// the caller's workspace BEFORE anything is inserted (HIGH-1 fix — a
// workspace-A token must not subscribe contacts into a workspace-B sequence);
// contactIds are chunked at 1000; and an already-subscribed contact/sequence
// pair is skipped rather than duplicated.

const mocks = vi.hoisted(() => ({
  sequenceFindMany: vi.fn(),
  sequenceFindFirst: vi.fn(),
  sequenceStepFindMany: vi.fn(),
  sequenceStepFindFirst: vi.fn(),
  contactsOnSequenceFindMany: vi.fn(),
  contactsOnSequenceFindFirst: vi.fn(),
  findManyByIds: vi.fn(),
  enrollContactsInSequenceBulk: vi.fn(),
  enrollContactInSequence: vi.fn(),
  getContactInboxes: vi.fn(),
  emitSequenceSubscribed: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      sequenceModel: {
        findMany: (...args: unknown[]) => mocks.sequenceFindMany(...args),
        findFirst: (...args: unknown[]) => mocks.sequenceFindFirst(...args),
      },
      sequenceStepModel: {
        findMany: (...args: unknown[]) => mocks.sequenceStepFindMany(...args),
        findFirst: (...args: unknown[]) => mocks.sequenceStepFindFirst(...args),
      },
      contactsOnSequenceModel: {
        findMany: (...args: unknown[]) =>
          mocks.contactsOnSequenceFindMany(...args),
        findFirst: (...args: unknown[]) =>
          mocks.contactsOnSequenceFindFirst(...args),
      },
    },
  },
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  inArray: (col: unknown, vals: unknown) => ({ inArray: [col, vals] }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactsOnSequenceModel: { id: "contactsOnSequenceModel.id" },
  sequenceModel: { id: "sequenceModel.id", name: "sequenceModel.name" },
}))

vi.mock("@chatbotx.io/events", () => ({
  emitSequenceUnsubscribed: vi.fn(),
  emitSequenceSubscribed: (...args: unknown[]) =>
    mocks.emitSequenceSubscribed(...args),
}))

vi.mock("@chatbotx.io/sequence-scheduler", () => ({
  calculateNextRunAtFromStep: vi.fn(() => new Date("2026-01-01T00:00:00Z")),
  cancelPendingDispatches: vi.fn(),
  enrollContactInSequence: (...args: unknown[]) =>
    mocks.enrollContactInSequence(...args),
  enrollContactsInSequenceBulk: (...args: unknown[]) =>
    mocks.enrollContactsInSequenceBulk(...args),
  getContactInboxes: (...args: unknown[]) => mocks.getContactInboxes(...args),
  removeDispatchesFromSchedule: vi.fn(),
}))

vi.mock("../src/contact/service", () => ({
  contactService: {
    findManyByIds: (...args: unknown[]) => mocks.findManyByIds(...args),
  },
}))

vi.mock("../src/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), debug: vi.fn(), info: vi.fn() },
}))

const { contactSequenceService } = await import(
  "../src/contact-sequence/service"
)

const WORKSPACE_ID = "ws-1"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.sequenceStepFindMany.mockResolvedValue([])
  mocks.contactsOnSequenceFindMany.mockResolvedValue([])
  mocks.contactsOnSequenceFindFirst.mockResolvedValue(null)
  mocks.sequenceStepFindFirst.mockResolvedValue(null)
  mocks.sequenceFindFirst.mockResolvedValue(null)
  mocks.enrollContactsInSequenceBulk.mockResolvedValue(undefined)
  mocks.enrollContactInSequence.mockResolvedValue({ enrolled: true })
  mocks.getContactInboxes.mockResolvedValue([{ id: "ci-1" }])
})

describe("contactSequenceService.subscribeContacts", () => {
  test("throws and inserts nothing when a sequenceId belongs to another workspace", async () => {
    mocks.sequenceFindMany.mockResolvedValueOnce([{ id: "seq-owned" }])

    await expect(
      contactSequenceService.subscribeContacts({
        workspaceId: WORKSPACE_ID,
        contactIds: ["contact-1"],
        sequenceIds: ["seq-owned", "seq-other-workspace"],
      }),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(mocks.findManyByIds).not.toHaveBeenCalled()
    expect(mocks.enrollContactsInSequenceBulk).not.toHaveBeenCalled()
  })

  test("chunks contactIds at 1000 — 1001 ids means 2 findManyByIds calls", async () => {
    mocks.sequenceFindMany.mockResolvedValue([{ id: "seq-1" }])
    mocks.findManyByIds.mockImplementation(async ({ ids }) =>
      ids.map((id: string) => ({ id })),
    )

    const contactIds = Array.from({ length: 1001 }, (_, i) => `contact-${i}`)

    const result = await contactSequenceService.subscribeContacts({
      workspaceId: WORKSPACE_ID,
      contactIds,
      sequenceIds: ["seq-1"],
    })

    expect(mocks.findManyByIds).toHaveBeenCalledTimes(2)
    expect(mocks.findManyByIds).toHaveBeenNthCalledWith(1, {
      workspaceId: WORKSPACE_ID,
      ids: contactIds.slice(0, 1000),
      accessScope: undefined,
    })
    expect(mocks.findManyByIds).toHaveBeenNthCalledWith(2, {
      workspaceId: WORKSPACE_ID,
      ids: contactIds.slice(1000),
      accessScope: undefined,
    })
    expect(result.processedContactIds).toHaveLength(1001)
    expect(result.skippedContactIds).toEqual([])
  })

  test("skips an already-enrolled contact/sequence pair instead of duplicating it", async () => {
    mocks.sequenceFindMany.mockResolvedValueOnce([{ id: "seq-1" }])
    mocks.findManyByIds.mockResolvedValueOnce([
      { id: "contact-1" },
      { id: "contact-2" },
    ])
    mocks.contactsOnSequenceFindMany.mockResolvedValueOnce([
      { contactId: "contact-1", sequenceId: "seq-1" },
    ])

    await contactSequenceService.subscribeContacts({
      workspaceId: WORKSPACE_ID,
      contactIds: ["contact-1", "contact-2"],
      sequenceIds: ["seq-1"],
    })

    expect(mocks.enrollContactsInSequenceBulk).toHaveBeenCalledOnce()
    const [{ enrollments }] = mocks.enrollContactsInSequenceBulk.mock.calls[0]
    expect(enrollments).toEqual([
      expect.objectContaining({ contactId: "contact-2", sequenceId: "seq-1" }),
    ])
  })

  test("reports unresolved contact ids as skipped", async () => {
    mocks.sequenceFindMany.mockResolvedValueOnce([{ id: "seq-1" }])
    mocks.findManyByIds.mockResolvedValueOnce([{ id: "contact-1" }])

    const result = await contactSequenceService.subscribeContacts({
      workspaceId: WORKSPACE_ID,
      contactIds: ["contact-1", "deleted-contact"],
      sequenceIds: ["seq-1"],
    })

    expect(result).toEqual({
      processedContactIds: ["contact-1"],
      skippedContactIds: ["deleted-contact"],
    })
  })
})

describe("contactSequenceService.subscribeFromFlow", () => {
  test("does nothing when the contact is already enrolled", async () => {
    mocks.contactsOnSequenceFindFirst.mockResolvedValueOnce({ id: "enr-1" })

    await contactSequenceService.subscribeFromFlow({
      workspaceId: WORKSPACE_ID,
      contactId: "contact-1",
      sequenceId: "seq-1",
      contactInboxId: "ci-1",
    })

    expect(mocks.enrollContactInSequence).not.toHaveBeenCalled()
    expect(mocks.emitSequenceSubscribed).not.toHaveBeenCalled()
  })

  test("enrolls at the first active step and emits sequenceSubscribed with the sequence name", async () => {
    mocks.sequenceStepFindFirst.mockResolvedValueOnce({
      id: "step-1",
      delayDays: 1,
      delayMinutes: 30,
    })
    mocks.sequenceFindFirst.mockResolvedValueOnce({ name: "Welcome" })

    await contactSequenceService.subscribeFromFlow({
      workspaceId: WORKSPACE_ID,
      contactId: "contact-1",
      sequenceId: "seq-1",
      contactInboxId: "ci-1",
    })

    expect(mocks.enrollContactInSequence).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        contactId: "contact-1",
        sequenceId: "seq-1",
        nextStepId: "step-1",
      }),
    )
    expect(mocks.emitSequenceSubscribed).toHaveBeenCalledWith(
      WORKSPACE_ID,
      "contact-1",
      "seq-1",
      "Welcome",
      "ci-1",
    )
  })

  test("enrolls immediately (nextRunAt = now, nextStepId = null) when no first step exists", async () => {
    mocks.sequenceStepFindFirst.mockResolvedValueOnce(null)
    mocks.sequenceFindFirst.mockResolvedValueOnce({ name: "Welcome" })

    await contactSequenceService.subscribeFromFlow({
      workspaceId: WORKSPACE_ID,
      contactId: "contact-1",
      sequenceId: "seq-1",
      contactInboxId: "ci-1",
    })

    expect(mocks.enrollContactInSequence).toHaveBeenCalledWith(
      expect.objectContaining({ nextStepId: null }),
    )
  })

  test("does not emit sequenceSubscribed when a concurrent run won the enrollment", async () => {
    mocks.enrollContactInSequence.mockResolvedValueOnce({ enrolled: false })

    await contactSequenceService.subscribeFromFlow({
      workspaceId: WORKSPACE_ID,
      contactId: "contact-1",
      sequenceId: "seq-1",
      contactInboxId: "ci-1",
    })

    expect(mocks.enrollContactInSequence).toHaveBeenCalledTimes(1)
    expect(mocks.emitSequenceSubscribed).not.toHaveBeenCalled()
  })

  test("emits sequenceSubscribed with an empty name when the sequence lookup misses", async () => {
    mocks.sequenceFindFirst.mockResolvedValueOnce(null)

    await contactSequenceService.subscribeFromFlow({
      workspaceId: WORKSPACE_ID,
      contactId: "contact-1",
      sequenceId: "seq-1",
      contactInboxId: "ci-1",
    })

    expect(mocks.emitSequenceSubscribed).toHaveBeenCalledWith(
      WORKSPACE_ID,
      "contact-1",
      "seq-1",
      "",
      "ci-1",
    )
  })
})

describe("contactSequenceService.subscribeContactForTrigger", () => {
  const STEP_RUN_AT = new Date("2026-01-01T00:00:00Z")

  test("enrolls every owned sequence with its first-step timing and never emits sequenceSubscribed", async () => {
    mocks.sequenceFindMany.mockResolvedValueOnce([{ id: "101" }, { id: "102" }])
    mocks.sequenceStepFindMany.mockResolvedValueOnce([
      { id: "step-1", sequenceId: "101" },
    ])

    const result = await contactSequenceService.subscribeContactForTrigger({
      workspaceId: WORKSPACE_ID,
      contactId: "contact-1",
      sequenceIds: ["101", "102"],
    })

    expect(result).toEqual({ ownedSequenceIds: ["101", "102"] })
    expect(mocks.enrollContactInSequence).toHaveBeenCalledTimes(2)
    expect(mocks.enrollContactInSequence).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        workspaceId: WORKSPACE_ID,
        contactId: "contact-1",
        sequenceId: "101",
        nextStepId: "step-1",
        nextRunAt: STEP_RUN_AT,
      }),
    )
    expect(mocks.enrollContactInSequence).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ sequenceId: "102", nextStepId: null }),
    )
    expect(mocks.emitSequenceSubscribed).not.toHaveBeenCalled()
  })

  test("looks the contact's inboxes up once for all sequences and hands them to every enrollment", async () => {
    mocks.sequenceFindMany.mockResolvedValueOnce([{ id: "101" }, { id: "102" }])
    mocks.sequenceStepFindMany.mockResolvedValueOnce([
      { id: "step-1", sequenceId: "101" },
      { id: "step-2", sequenceId: "102" },
    ])

    await contactSequenceService.subscribeContactForTrigger({
      workspaceId: WORKSPACE_ID,
      contactId: "contact-1",
      sequenceIds: ["101", "102"],
    })

    expect(mocks.getContactInboxes).toHaveBeenCalledTimes(1)
    expect(mocks.getContactInboxes).toHaveBeenCalledWith(
      WORKSPACE_ID,
      "contact-1",
    )
    expect(mocks.enrollContactInSequence).toHaveBeenCalledTimes(2)
    for (const [params] of mocks.enrollContactInSequence.mock.calls) {
      expect(params.contactInboxes).toEqual([{ id: "ci-1" }])
    }
  })

  test("does not look inboxes up when no sequence has a first step", async () => {
    mocks.sequenceFindMany.mockResolvedValueOnce([{ id: "101" }, { id: "102" }])

    await contactSequenceService.subscribeContactForTrigger({
      workspaceId: WORKSPACE_ID,
      contactId: "contact-1",
      sequenceIds: ["101", "102"],
    })

    expect(mocks.getContactInboxes).not.toHaveBeenCalled()
    expect(mocks.enrollContactInSequence).toHaveBeenCalledTimes(2)
  })

  test("skips ids that do not exist in the workspace instead of throwing", async () => {
    mocks.sequenceFindMany.mockResolvedValueOnce([{ id: "101" }])

    const result = await contactSequenceService.subscribeContactForTrigger({
      workspaceId: WORKSPACE_ID,
      contactId: "contact-1",
      sequenceIds: ["101", "999"],
    })

    expect(result).toEqual({ ownedSequenceIds: ["101"] })
    expect(mocks.enrollContactInSequence).toHaveBeenCalledTimes(1)
    expect(mocks.enrollContactInSequence).toHaveBeenCalledWith(
      expect.objectContaining({ sequenceId: "101" }),
    )
  })

  test("returns no owned ids and enrolls nothing when none exist", async () => {
    mocks.sequenceFindMany.mockResolvedValueOnce([])

    const result = await contactSequenceService.subscribeContactForTrigger({
      workspaceId: WORKSPACE_ID,
      contactId: "contact-1",
      sequenceIds: ["999"],
    })

    expect(result).toEqual({ ownedSequenceIds: [] })
    expect(mocks.sequenceStepFindMany).not.toHaveBeenCalled()
    expect(mocks.enrollContactInSequence).not.toHaveBeenCalled()
  })

  test("ignores malformed ids without querying the database", async () => {
    const result = await contactSequenceService.subscribeContactForTrigger({
      workspaceId: WORKSPACE_ID,
      contactId: "contact-1",
      sequenceIds: ["not-a-number", "12x"],
    })

    expect(result).toEqual({ ownedSequenceIds: [] })
    expect(mocks.sequenceFindMany).not.toHaveBeenCalled()
    expect(mocks.enrollContactInSequence).not.toHaveBeenCalled()
  })

  test("enrolls a duplicated id only once", async () => {
    mocks.sequenceFindMany.mockResolvedValueOnce([{ id: "101" }])

    await contactSequenceService.subscribeContactForTrigger({
      workspaceId: WORKSPACE_ID,
      contactId: "contact-1",
      sequenceIds: ["101", "101"],
    })

    expect(mocks.enrollContactInSequence).toHaveBeenCalledTimes(1)
  })

  test("one sequence failing does not stop the others, and every failure is thrown together", async () => {
    mocks.sequenceFindMany.mockResolvedValueOnce([
      { id: "101" },
      { id: "102" },
      { id: "103" },
    ])
    const scheduleError = new Error("redis down")
    mocks.enrollContactInSequence
      .mockRejectedValueOnce(scheduleError)
      .mockResolvedValueOnce({ enrolled: true })
      .mockRejectedValueOnce(new Error("db down"))

    const outcome = await contactSequenceService
      .subscribeContactForTrigger({
        workspaceId: WORKSPACE_ID,
        contactId: "contact-1",
        sequenceIds: ["101", "102", "103"],
      })
      .then(
        () => null,
        (error: unknown) => error,
      )

    expect(mocks.enrollContactInSequence).toHaveBeenCalledTimes(3)
    expect(outcome).toBeInstanceOf(AggregateError)
    expect((outcome as AggregateError).errors).toHaveLength(2)
    expect((outcome as AggregateError).errors[0]).toBe(scheduleError)
    expect((outcome as AggregateError).message).toContain("2 of 3")
  })
})
