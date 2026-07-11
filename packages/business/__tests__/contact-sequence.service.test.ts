import { beforeEach, describe, expect, test, vi } from "vitest"

const {
  cancelPendingDispatchesSpy,
  deleteWhereSpy,
  enrollContactInSequenceSpy,
  emitSequenceUnsubscribedSpy,
  findManySpy,
  loggerWarnSpy,
  selectFromSpy,
  selectWhereSpy,
  sequenceStepFindManySpy,
  order,
  removeDispatchesFromScheduleSpy,
  transactionSpy,
} = vi.hoisted(() => {
  const order: string[] = []
  return {
    cancelPendingDispatchesSpy: vi.fn().mockImplementation(() => {
      order.push("cancel")
      return Promise.resolve([{ id: "dispatch-1", bucket: 1 }])
    }),
    deleteWhereSpy: vi.fn().mockImplementation(() => {
      order.push("delete")
      return Promise.resolve(undefined)
    }),
    enrollContactInSequenceSpy: vi.fn().mockResolvedValue(undefined),
    emitSequenceUnsubscribedSpy: vi.fn().mockResolvedValue(undefined),
    findManySpy: vi.fn(),
    loggerWarnSpy: vi.fn(),
    selectFromSpy: vi.fn(),
    selectWhereSpy: vi.fn(),
    order,
    removeDispatchesFromScheduleSpy: vi.fn().mockImplementation(() => {
      order.push("remove")
      return Promise.resolve(undefined)
    }),
    sequenceStepFindManySpy: vi.fn(),
    transactionSpy: vi.fn(),
  }
})

const txClient = {
  delete: vi.fn(() => ({ where: deleteWhereSpy })),
  query: {
    contactsOnSequenceModel: {
      findMany: findManySpy,
    },
    sequenceStepModel: {
      findMany: sequenceStepFindManySpy,
    },
  },
}

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  db: {
    query: {
      contactsOnSequenceModel: {
        findMany: findManySpy,
      },
      sequenceStepModel: {
        findMany: sequenceStepFindManySpy,
      },
    },
    select: vi.fn(() => ({ from: selectFromSpy })),
    transaction: transactionSpy,
  },
  eq: (column: unknown, value: unknown) => ({ __eq: [column, value] }),
  inArray: (column: unknown, value: unknown) => ({
    __inArray: [column, value],
  }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  contactsOnSequenceModel: {
    id: { __column: "id" },
    workspaceId: { __column: "workspaceId" },
  },
  sequenceModel: {
    id: { __column: "sequence.id" },
    name: { __column: "sequence.name" },
  },
}))

vi.mock("@chatbotx.io/events", () => ({
  emitSequenceUnsubscribed: emitSequenceUnsubscribedSpy,
}))

vi.mock("../src/logger", () => ({
  logger: {
    warn: loggerWarnSpy,
  },
}))

vi.mock("@chatbotx.io/sequence-scheduler", () => ({
  cancelPendingDispatches: cancelPendingDispatchesSpy,
  enrollContactInSequence: enrollContactInSequenceSpy,
  removeDispatchesFromSchedule: removeDispatchesFromScheduleSpy,
}))

const { contactSequenceService } = await import(
  "../src/contact-sequence/service"
)

describe("contactSequenceService", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    order.length = 0
    findManySpy.mockResolvedValue([
      {
        contactId: "contact-1",
        id: "enrollment-1",
        sequenceId: "sequence-1",
        workspaceId: "ws-1",
      },
    ])
    selectFromSpy.mockReturnValue({ where: selectWhereSpy })
    selectWhereSpy.mockResolvedValue([{ id: "sequence-1", name: "Sequence 1" }])
    sequenceStepFindManySpy.mockResolvedValue([])
    deleteWhereSpy.mockImplementation(() => {
      order.push("delete")
      return Promise.resolve(undefined)
    })
    cancelPendingDispatchesSpy.mockImplementation(({ enrollmentId }) => {
      order.push("cancel")
      return Promise.resolve([{ id: `dispatch-${enrollmentId}`, bucket: 1 }])
    })
    removeDispatchesFromScheduleSpy.mockImplementation(() => {
      order.push("remove")
      return Promise.resolve(undefined)
    })
    enrollContactInSequenceSpy.mockResolvedValue(undefined)
    transactionSpy.mockImplementation(async (cb) => {
      const result = await cb(txClient)
      order.push("tx-done")
      return result
    })
  })

  test("removes contact sequences in a transaction before removing scheduler entries", async () => {
    await contactSequenceService.removeContactSequencesForContacts({
      workspaceId: "ws-1",
      contactIds: ["contact-1"],
      sequenceIds: ["sequence-1"],
      reason: "enrollment_removed",
    })

    expect(findManySpy).toHaveBeenCalledOnce()
    expect(cancelPendingDispatchesSpy).toHaveBeenCalledWith({
      client: txClient,
      enrollmentId: "enrollment-1",
      workspaceId: "ws-1",
      reason: "enrollment_removed",
      removeFromSchedule: false,
    })
    expect(deleteWhereSpy).toHaveBeenCalledOnce()
    expect(removeDispatchesFromScheduleSpy).toHaveBeenCalledWith([
      { id: "dispatch-enrollment-1", bucket: 1 },
    ])
    expect(order).toEqual(["cancel", "delete", "tx-done", "remove"])
  })

  test("logs and resolves when scheduler removal fails after remove commit", async () => {
    const scheduleError = new Error("redis down")
    removeDispatchesFromScheduleSpy.mockRejectedValueOnce(scheduleError)

    const result =
      await contactSequenceService.removeContactSequencesForContacts({
        workspaceId: "ws-1",
        contactIds: ["contact-1"],
        sequenceIds: ["sequence-1"],
        reason: "enrollment_removed",
      })

    expect(result).toEqual([{ id: "dispatch-enrollment-1", bucket: 1 }])
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      { err: scheduleError, dispatchCount: 1 },
      "Failed to remove dispatches from schedule after DB commit",
    )
  })

  test("does not remove scheduler entries when deleting enrollments fails", async () => {
    deleteWhereSpy.mockRejectedValueOnce(new Error("delete failed"))

    await expect(
      contactSequenceService.removeContactSequencesForContacts({
        workspaceId: "ws-1",
        contactIds: ["contact-1"],
        sequenceIds: ["sequence-1"],
        reason: "enrollment_removed",
      }),
    ).rejects.toThrow("delete failed")

    expect(removeDispatchesFromScheduleSpy).not.toHaveBeenCalled()
  })

  test("updates contact sequences in one transaction and defers scheduler removal until add succeeds", async () => {
    findManySpy
      .mockResolvedValueOnce([{ sequenceId: "sequence-old" }])
      .mockResolvedValueOnce([{ id: "enrollment-old", workspaceId: "ws-1" }])
    sequenceStepFindManySpy.mockResolvedValueOnce([])
    enrollContactInSequenceSpy.mockRejectedValueOnce(new Error("add failed"))
    transactionSpy.mockImplementationOnce(async (cb) => {
      await cb(txClient)
      order.push("tx-done")
    })

    await expect(
      contactSequenceService.updateContactSequences({
        workspaceId: "ws-1",
        contactId: "contact-1",
        sequenceIds: ["sequence-new"],
      }),
    ).rejects.toThrow("add failed")

    expect(transactionSpy).toHaveBeenCalledOnce()
    expect(cancelPendingDispatchesSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        client: txClient,
        enrollmentId: "enrollment-old",
        removeFromSchedule: false,
      }),
    )
    expect(removeDispatchesFromScheduleSpy).not.toHaveBeenCalled()
    expect(order).toEqual(["cancel", "delete"])
  })

  test("logs and returns updated sequences when scheduler removal fails after update commit", async () => {
    const returnedSequences = [
      { id: "enrollment-new", sequence: { id: "sequence-new" } },
    ]
    const scheduleError = new Error("redis down")
    findManySpy
      .mockResolvedValueOnce([{ sequenceId: "sequence-old" }])
      .mockResolvedValueOnce([{ id: "enrollment-old", workspaceId: "ws-1" }])
      .mockResolvedValueOnce(returnedSequences)
    sequenceStepFindManySpy.mockResolvedValueOnce([])
    removeDispatchesFromScheduleSpy.mockRejectedValueOnce(scheduleError)

    const result = await contactSequenceService.updateContactSequences({
      workspaceId: "ws-1",
      contactId: "contact-1",
      sequenceIds: ["sequence-new"],
    })

    expect(result).toEqual(returnedSequences)
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      { err: scheduleError, dispatchCount: 1 },
      "Failed to remove dispatches from schedule after DB commit",
    )
  })

  test("emits sequence unsubscribe events after update commit", async () => {
    const returnedSequences = [
      { id: "enrollment-new", sequence: { id: "sequence-new" } },
    ]
    findManySpy
      .mockResolvedValueOnce([{ sequenceId: "sequence-old" }])
      .mockResolvedValueOnce([
        {
          contactId: "contact-1",
          id: "enrollment-old",
          sequenceId: "sequence-old",
          workspaceId: "ws-1",
        },
      ])
      .mockResolvedValueOnce(returnedSequences)
    sequenceStepFindManySpy.mockResolvedValueOnce([])
    selectWhereSpy.mockResolvedValueOnce([
      { id: "sequence-old", name: "Old sequence" },
    ])

    const result = await contactSequenceService.updateContactSequences({
      workspaceId: "ws-1",
      contactId: "contact-1",
      sequenceIds: ["sequence-new"],
    })

    expect(result).toEqual(returnedSequences)
    await vi.waitFor(() => {
      expect(emitSequenceUnsubscribedSpy).toHaveBeenCalledWith(
        "ws-1",
        "contact-1",
        "sequence-old",
        "Old sequence",
      )
    })
    expect(
      removeDispatchesFromScheduleSpy.mock.invocationCallOrder[0],
    ).toBeLessThan(emitSequenceUnsubscribedSpy.mock.invocationCallOrder[0])
  })

  test("removes with a supplied client without opening a nested transaction", async () => {
    const result =
      await contactSequenceService.removeContactSequencesForContacts({
        workspaceId: "ws-1",
        contactIds: ["contact-1"],
        sequenceIds: ["sequence-1"],
        reason: "enrollment_removed",
        client: txClient,
        removeFromSchedule: false,
      })

    expect(transactionSpy).not.toHaveBeenCalled()
    expect(removeDispatchesFromScheduleSpy).not.toHaveBeenCalled()
    expect(result).toEqual([{ id: "dispatch-enrollment-1", bucket: 1 }])
  })

  test("rejects using a supplied client and an internal transaction together", async () => {
    await expect(
      contactSequenceService.removeContactSequencesForContacts({
        workspaceId: "ws-1",
        contactIds: ["contact-1"],
        sequenceIds: ["sequence-1"],
        reason: "enrollment_removed",
        client: txClient,
        useTransaction: true,
      }),
    ).rejects.toThrow("client and useTransaction are mutually exclusive")

    expect(transactionSpy).not.toHaveBeenCalled()
    expect(cancelPendingDispatchesSpy).not.toHaveBeenCalled()
    expect(deleteWhereSpy).not.toHaveBeenCalled()
  })
})
