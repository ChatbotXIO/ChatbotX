import { beforeEach, describe, expect, test, vi } from "vitest"

// contactSequenceService.enrollContacts: sequenceIds are validated against
// the caller's workspace BEFORE anything is inserted (HIGH-1 fix — a
// workspace-A token must not enroll contacts into a workspace-B sequence);
// contactIds are chunked at 1000; and an already-enrolled contact/sequence
// pair is skipped rather than duplicated.

const mocks = vi.hoisted(() => ({
  sequenceFindMany: vi.fn(),
  sequenceStepFindMany: vi.fn(),
  contactsOnSequenceFindMany: vi.fn(),
  findManyByIds: vi.fn(),
  enrollContactsInSequenceBulk: vi.fn(),
}))

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    query: {
      sequenceModel: {
        findMany: (...args: unknown[]) => mocks.sequenceFindMany(...args),
      },
      sequenceStepModel: {
        findMany: (...args: unknown[]) => mocks.sequenceStepFindMany(...args),
      },
      contactsOnSequenceModel: {
        findMany: (...args: unknown[]) =>
          mocks.contactsOnSequenceFindMany(...args),
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
}))

vi.mock("@chatbotx.io/sequence-scheduler", () => ({
  calculateNextRunAtFromStep: vi.fn(() => new Date("2026-01-01T00:00:00Z")),
  cancelPendingDispatches: vi.fn(),
  enrollContactInSequence: vi.fn(),
  enrollContactsInSequenceBulk: (...args: unknown[]) =>
    mocks.enrollContactsInSequenceBulk(...args),
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
  mocks.enrollContactsInSequenceBulk.mockResolvedValue(undefined)
})

describe("contactSequenceService.enrollContacts", () => {
  test("throws and inserts nothing when a sequenceId belongs to another workspace", async () => {
    mocks.sequenceFindMany.mockResolvedValueOnce([{ id: "seq-owned" }])

    await expect(
      contactSequenceService.enrollContacts({
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

    const result = await contactSequenceService.enrollContacts({
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

    await contactSequenceService.enrollContacts({
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

    const result = await contactSequenceService.enrollContacts({
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
