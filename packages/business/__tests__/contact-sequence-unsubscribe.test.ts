import { beforeEach, describe, expect, test, vi } from "vitest"

// contactSequenceService.unsubscribeContacts: sequenceIds are validated against
// the caller's workspace BEFORE anything is removed, contactIds are chunked at
// 1000, and ids that do not resolve in the workspace are reported as skipped.

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
  mocks.enrollContactInSequence.mockResolvedValue(undefined)
})

describe("contactSequenceService.unsubscribeContacts", () => {
  let removeSpy: ReturnType<
    typeof vi.spyOn<
      typeof contactSequenceService,
      "removeContactSequencesForContacts"
    >
  >

  beforeEach(() => {
    removeSpy = vi
      .spyOn(contactSequenceService, "removeContactSequencesForContacts")
      .mockResolvedValue([])
  })

  test("throws and removes nothing when a sequenceId belongs to another workspace", async () => {
    mocks.sequenceFindMany.mockResolvedValueOnce([{ id: "seq-owned" }])

    await expect(
      contactSequenceService.unsubscribeContacts({
        workspaceId: WORKSPACE_ID,
        contactIds: ["contact-1"],
        sequenceIds: ["seq-owned", "seq-other-workspace"],
      }),
    ).rejects.toMatchObject({ code: "notFound" })

    expect(mocks.findManyByIds).not.toHaveBeenCalled()
    expect(removeSpy).not.toHaveBeenCalled()
  })

  test("removes only contacts that resolve and reports the rest as skipped", async () => {
    mocks.sequenceFindMany.mockResolvedValueOnce([{ id: "seq-1" }])
    mocks.findManyByIds.mockResolvedValueOnce([{ id: "c1" }, { id: "c3" }])

    const result = await contactSequenceService.unsubscribeContacts({
      workspaceId: WORKSPACE_ID,
      contactIds: ["c1", "c2", "c3"],
      sequenceIds: ["seq-1"],
    })

    expect(removeSpy).toHaveBeenCalledWith({
      workspaceId: WORKSPACE_ID,
      contactIds: ["c1", "c3"],
      sequenceIds: ["seq-1"],
      reason: "subscription_removed",
    })
    expect(result).toEqual({
      processedContactIds: ["c1", "c3"],
      skippedContactIds: ["c2"],
    })
  })

  test("chunks contactIds at 1000 and skips the removal call for an empty chunk", async () => {
    mocks.sequenceFindMany.mockResolvedValue([{ id: "seq-1" }])
    mocks.findManyByIds
      .mockResolvedValueOnce([])
      .mockImplementationOnce(async ({ ids }) =>
        ids.map((id: string) => ({ id })),
      )
    const contactIds = Array.from({ length: 1001 }, (_, i) => `contact-${i}`)

    const result = await contactSequenceService.unsubscribeContacts({
      workspaceId: WORKSPACE_ID,
      contactIds,
      sequenceIds: ["seq-1"],
    })

    expect(mocks.findManyByIds).toHaveBeenCalledTimes(2)
    expect(removeSpy).toHaveBeenCalledTimes(1)
    expect(result.processedContactIds).toEqual(["contact-1000"])
    expect(result.skippedContactIds).toHaveLength(1000)
  })
})
