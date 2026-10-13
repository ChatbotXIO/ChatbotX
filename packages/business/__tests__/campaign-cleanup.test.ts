import { beforeEach, expect, test, vi } from "vitest"

const updateReturningMock = vi.fn()
const updateWhereMock = vi.fn()
const updateSetMock = vi.fn()
const updateMock = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  and: (...conditions: unknown[]) => ({ __and: conditions }),
  db: {
    update: (...args: unknown[]) => updateMock(...args),
    transaction: async (run: (tx: unknown) => Promise<unknown>) =>
      await run({ update: (...args: unknown[]) => updateMock(...args) }),
  },
  eq: (column: unknown, value: unknown) => ({ __eq: [column, value] }),
  inArray: (column: unknown, value: unknown) => ({
    __inArray: [column, value],
  }),
}))

vi.mock("@chatbotx.io/database/partials", () => ({
  broadcastStatuses: {
    enum: {
      cancelled: "cancelled",
      scheduled: "scheduled",
      sending: "sending",
      recurring: "recurring",
    },
  },
}))

const disarmAllForWorkspaceMock = vi.fn()
vi.mock("../src/broadcast/recurrence-ledger", () => ({
  disarmAllSeriesForWorkspace: (...args: unknown[]) =>
    disarmAllForWorkspaceMock(...args),
}))

vi.mock("@chatbotx.io/database/schema", () => ({
  broadcastModel: {
    id: { __column: "broadcast.id" },
    status: { __column: "broadcast.status" },
    workspaceId: { __column: "broadcast.workspaceId" },
  },
  contactsOnSequenceModel: {
    id: { __column: "contactsOnSequence.id" },
    status: { __column: "contactsOnSequence.status" },
    workspaceId: { __column: "contactsOnSequence.workspaceId" },
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  updateReturningMock.mockResolvedValue([{ id: "row-1" }])
  updateWhereMock.mockReturnValue({ returning: updateReturningMock })
  updateSetMock.mockReturnValue({ where: updateWhereMock })
  updateMock.mockReturnValue({ set: updateSetMock })
})

test("cancelInFlightBroadcastsForWorkspace cancels scheduled, sending and recurring broadcasts only, stopping their series first", async () => {
  const { cancelInFlightBroadcastsForWorkspace } = await import(
    "../src/workspace-lifecycle/campaign-cleanup"
  )

  const cancelledCount = await cancelInFlightBroadcastsForWorkspace({
    workspaceId: "workspace-1",
  })

  expect(cancelledCount).toBe(1)
  expect(disarmAllForWorkspaceMock).toHaveBeenCalledTimes(1)
  expect(disarmAllForWorkspaceMock.mock.calls[0][1]).toEqual({
    workspaceId: "workspace-1",
  })
  // Series rows are locked and stopped BEFORE the broadcast rows are touched.
  expect(disarmAllForWorkspaceMock.mock.invocationCallOrder[0]).toBeLessThan(
    updateMock.mock.invocationCallOrder[0],
  )
  expect(updateMock).toHaveBeenCalledOnce()
  expect(updateSetMock).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "cancelled",
    }),
  )
  expect(updateWhereMock).toHaveBeenCalledWith(
    expect.objectContaining({
      __and: expect.arrayContaining([
        expect.objectContaining({
          __eq: [
            expect.objectContaining({ __column: "broadcast.workspaceId" }),
            "workspace-1",
          ],
        }),
        expect.objectContaining({
          __inArray: [
            expect.objectContaining({ __column: "broadcast.status" }),
            ["scheduled", "sending", "recurring"],
          ],
        }),
      ]),
    }),
  )
})

test("completeActiveSequenceEnrollmentsForWorkspace marks active enrollments completed", async () => {
  const { completeActiveSequenceEnrollmentsForWorkspace } = await import(
    "../src/workspace-lifecycle/campaign-cleanup"
  )

  const completedCount = await completeActiveSequenceEnrollmentsForWorkspace({
    workspaceId: "workspace-1",
  })

  expect(completedCount).toBe(1)
  expect(updateMock).toHaveBeenCalledOnce()
  expect(updateSetMock).toHaveBeenCalledWith(
    expect.objectContaining({
      status: "completed",
      nextRunAt: null,
      nextStepId: null,
    }),
  )
  expect(updateWhereMock).toHaveBeenCalledWith(
    expect.objectContaining({
      __and: expect.arrayContaining([
        expect.objectContaining({
          __eq: [
            expect.objectContaining({
              __column: "contactsOnSequence.workspaceId",
            }),
            "workspace-1",
          ],
        }),
        expect.objectContaining({
          __eq: [
            expect.objectContaining({ __column: "contactsOnSequence.status" }),
            "active",
          ],
        }),
      ]),
    }),
  )
})
