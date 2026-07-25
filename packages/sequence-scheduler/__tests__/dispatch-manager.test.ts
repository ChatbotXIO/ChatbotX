import { beforeEach, describe, expect, test, vi } from "vitest"

const returningInsertMock = vi.fn()
const transactionMock = vi.fn()
const findManyMock = vi.fn()
const updateWhereMock = vi.fn()
const removeFromScheduleMock = vi.fn()
const useExistingMock = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    insert: () => ({
      values: () => ({ returning: returningInsertMock }),
    }),
    query: {
      sequenceDispatchModel: { findMany: findManyMock },
    },
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      transactionMock()
      return await cb({
        insert: () => ({
          values: () => ({ returning: returningInsertMock }),
        }),
      })
    },
    update: () => ({ set: () => ({ where: updateWhereMock }) }),
  },
  and: (...a: unknown[]) => ({ __and: a }),
  eq: (c: unknown, v: unknown) => ({ __eq: [c, v] }),
  inArray: (c: unknown, v: unknown) => ({ __inArray: [c, v] }),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  sequenceDispatchModel: {
    __table: "SequenceDispatch",
    id: { __col: "id" },
    bucket: { __col: "bucket" },
    workspaceId: { __col: "workspaceId" },
    status: { __col: "status" },
  },
}))

vi.mock("@chatbotx.io/redis", () => ({
  sequenceConnections: { useExisting: useExistingMock },
}))

vi.mock("@chatbotx.io/scheduler", () => ({
  // Must use a regular function (not arrow) so that `new SchedulerClient()` works
  SchedulerClient: vi.fn(function SchedulerClientMock() {
    return { removeFromSchedule: removeFromScheduleMock }
  }),
}))

vi.mock("@chatbotx.io/utils", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@chatbotx.io/utils")>()
  return {
    ...actual,
    createId: () => "test-id",
  }
})

describe("calculateBucket", () => {
  test("returns a number between 0 and 255 inclusive", async () => {
    const { calculateBucket } = await import("../src/dispatch-manager")

    const bucket = calculateBucket("workspace-1", "contact-1")

    expect(bucket).toBeGreaterThanOrEqual(0)
    expect(bucket).toBeLessThanOrEqual(255)
  })

  test("is deterministic — same inputs always produce the same bucket", async () => {
    const { calculateBucket } = await import("../src/dispatch-manager")

    const first = calculateBucket("workspace-abc", "contact-xyz")
    const second = calculateBucket("workspace-abc", "contact-xyz")

    expect(first).toBe(second)
  })

  test("produces different buckets for different workspaceId + contactId pairs", async () => {
    const { calculateBucket } = await import("../src/dispatch-manager")

    const bucketA = calculateBucket("workspace-1", "contact-1")
    const bucketB = calculateBucket("workspace-2", "contact-2")

    // Collision is possible (1/256 chance) but this pairing is chosen to differ
    // so this test can assert the non-collision behavior for known inputs.
    expect(bucketA).not.toBe(bucketB)
  })
})

describe("generateIdempotencyKey", () => {
  test("produces the exact format workspaceId:enrollmentId:stepId:runAt.toISOString()", async () => {
    const { generateIdempotencyKey } = await import("../src/dispatch-manager")
    const runAt = new Date("2024-06-01T10:30:00.000Z")

    const key = generateIdempotencyKey("ws-1", "enroll-1", "step-1", runAt)

    expect(key).toBe(`ws-1:enroll-1:step-1:${runAt.toISOString()}`)
  })

  test("uses runAt.toISOString so the key is stable across calls with the same Date", async () => {
    const { generateIdempotencyKey } = await import("../src/dispatch-manager")
    const runAt = new Date("2025-01-15T08:00:00.000Z")

    const keyA = generateIdempotencyKey("ws-x", "e-1", "s-1", runAt)
    const keyB = generateIdempotencyKey(
      "ws-x",
      "e-1",
      "s-1",
      new Date(runAt.getTime()),
    )

    expect(keyA).toBe(keyB)
  })
})

describe("createDispatch", () => {
  beforeEach(() => {
    transactionMock.mockClear()
    returningInsertMock.mockResolvedValue([
      { id: "test-id", bucket: 77, runAtMs: "1700000000000" },
    ])
  })

  test("returns the created dispatch record on success", async () => {
    const { createDispatch } = await import("../src/dispatch-manager")
    const runAt = new Date(1_700_000_000_000)

    const result = await createDispatch({
      workspaceId: "ws-1",
      contactId: "contact-1",
      contactInboxId: "inbox-1",
      enrollmentId: "enroll-1",
      runAt,
      sequenceId: "seq-1",
      stepId: "step-1",
    })

    expect(result).toEqual({
      id: "test-id",
      bucket: 77,
      runAtMs: "1700000000000",
    })
    expect(transactionMock).not.toHaveBeenCalled()
  })

  test("throws 'Failed to create dispatch' when insert returns empty array", async () => {
    const { createDispatch } = await import("../src/dispatch-manager")
    returningInsertMock.mockResolvedValue([])

    await expect(
      createDispatch({
        workspaceId: "ws-1",
        contactId: "contact-1",
        contactInboxId: "inbox-1",
        enrollmentId: "enroll-1",
        runAt: new Date(),
        sequenceId: "seq-1",
        stepId: "step-1",
      }),
    ).rejects.toThrow("Failed to create dispatch")
  })

  test("uses provided client instead of default db", async () => {
    const { createDispatch } = await import("../src/dispatch-manager")
    const customReturningMock = vi
      .fn()
      .mockResolvedValue([{ id: "custom-id", bucket: 5, runAtMs: "999" }])
    const customClient = {
      insert: () => ({ values: () => ({ returning: customReturningMock }) }),
    } as never

    const result = await createDispatch({
      workspaceId: "ws-2",
      contactId: "contact-2",
      contactInboxId: "inbox-2",
      enrollmentId: "enroll-2",
      runAt: new Date(),
      sequenceId: "seq-2",
      stepId: "step-2",
      client: customClient,
    })

    expect(customReturningMock).toHaveBeenCalledTimes(1)
    expect(returningInsertMock).not.toHaveBeenCalled()
    expect(transactionMock).not.toHaveBeenCalled()
    expect(result.id).toBe("custom-id")
  })

  test("uses the provided root db client without wrapping another transaction", async () => {
    const { createDispatch } = await import("../src/dispatch-manager")
    const { db } = await import("@chatbotx.io/database/client")

    const result = await createDispatch({
      workspaceId: "ws-2",
      contactId: "contact-2",
      contactInboxId: "inbox-2",
      enrollmentId: "enroll-2",
      runAt: new Date(),
      sequenceId: "seq-2",
      stepId: "step-2",
      client: db,
    })

    expect(transactionMock).not.toHaveBeenCalled()
    expect(result.id).toBe("test-id")
  })

  test("throws when SequenceDispatch unique idempotency insert conflicts", async () => {
    const { createDispatch } = await import("../src/dispatch-manager")
    returningInsertMock.mockRejectedValue(new Error("duplicate key"))

    await expect(
      createDispatch({
        workspaceId: "ws-1",
        contactId: "contact-1",
        contactInboxId: "inbox-1",
        enrollmentId: "enroll-1",
        runAt: new Date(),
        sequenceId: "seq-1",
        stepId: "step-1",
      }),
    ).rejects.toThrow("duplicate key")
  })
})

describe("cancelPendingDispatches", () => {
  beforeEach(() => {
    findManyMock.mockResolvedValue([])
    updateWhereMock.mockResolvedValue(undefined)
    useExistingMock.mockResolvedValue({})
    removeFromScheduleMock.mockResolvedValue(undefined)
  })

  test("returns empty array and skips update when no pending dispatches exist", async () => {
    const { cancelPendingDispatches } = await import("../src/dispatch-cancel")
    findManyMock.mockResolvedValue([])

    const result = await cancelPendingDispatches({
      enrollmentId: "enroll-1",
      workspaceId: "ws-1",
    })

    expect(result).toEqual([])
    expect(updateWhereMock).not.toHaveBeenCalled()
    expect(removeFromScheduleMock).not.toHaveBeenCalled()
  })

  test("cancels pending dispatches, calls removeFromSchedule for each, and returns id+bucket", async () => {
    const { cancelPendingDispatches } = await import("../src/dispatch-cancel")
    const pendingDispatches = [
      {
        id: "d-1",
        bucket: 10,
        sequenceId: "seq-1",
        contactId: "c-1",
        stepId: "s-1",
      },
      {
        id: "d-2",
        bucket: 20,
        sequenceId: "seq-1",
        contactId: "c-1",
        stepId: "s-2",
      },
    ]
    findManyMock.mockResolvedValue(pendingDispatches)

    const result = await cancelPendingDispatches({
      enrollmentId: "enroll-1",
      workspaceId: "ws-1",
    })

    expect(updateWhereMock).toHaveBeenCalledTimes(1)
    expect(removeFromScheduleMock).toHaveBeenCalledTimes(2)
    expect(removeFromScheduleMock).toHaveBeenCalledWith(10, "d-1")
    expect(removeFromScheduleMock).toHaveBeenCalledWith(20, "d-2")
    expect(result).toEqual([
      { id: "d-1", bucket: 10 },
      { id: "d-2", bucket: 20 },
    ])
  })

  test("calls useExisting to obtain the redis client before scheduling removal", async () => {
    const { cancelPendingDispatches } = await import("../src/dispatch-cancel")
    findManyMock.mockResolvedValue([
      {
        id: "d-1",
        bucket: 5,
        sequenceId: "seq-1",
        contactId: "c-1",
        stepId: "s-1",
      },
    ])

    await cancelPendingDispatches({
      enrollmentId: "enroll-1",
      workspaceId: "ws-1",
    })

    expect(useExistingMock).toHaveBeenCalledTimes(1)
  })

  test("uses provided client instead of default db for the query", async () => {
    const { cancelPendingDispatches } = await import("../src/dispatch-cancel")
    const customFindManyMock = vi.fn().mockResolvedValue([])
    const customClient = {
      query: {
        sequenceDispatchModel: { findMany: customFindManyMock },
      },
      update: () => ({
        set: () => ({ where: vi.fn().mockResolvedValue(undefined) }),
      }),
    } as never

    await cancelPendingDispatches({
      enrollmentId: "enroll-1",
      workspaceId: "ws-1",
      client: customClient,
    })

    expect(customFindManyMock).toHaveBeenCalledTimes(1)
    expect(findManyMock).not.toHaveBeenCalled()
  })

  test("cancels all pending dispatches for a workspace without enrollmentId", async () => {
    const { cancelPendingDispatchesForWorkspace } = await import(
      "../src/dispatch-cancel"
    )
    findManyMock.mockResolvedValue([
      {
        id: "d-1",
        bucket: 9,
        sequenceId: "seq-1",
        contactId: "c-1",
        stepId: "s-1",
      },
    ])

    const result = await cancelPendingDispatchesForWorkspace({
      workspaceId: "ws-2",
    })

    expect(result).toEqual([{ id: "d-1", bucket: 9 }])
    expect(findManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "ws-2",
          status: "pending",
        }),
      }),
    )
  })
})
