import { beforeEach, expect, test, vi } from "vitest"

const order: string[] = []
const transactionMock = vi.fn()
const cancelInFlightBroadcastsForWorkspaceMock = vi.fn()
const completeActiveSequenceEnrollmentsForWorkspaceMock = vi.fn()
const cancelPendingDispatchesForWorkspaceMock = vi.fn()
const removeDispatchesFromScheduleMock = vi.fn()
const loggerWarnMock = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  db: {
    transaction: transactionMock,
  },
}))

vi.mock("@chatbotx.io/sequence-scheduler", () => ({
  cancelPendingDispatchesForWorkspace: cancelPendingDispatchesForWorkspaceMock,
  removeDispatchesFromSchedule: removeDispatchesFromScheduleMock,
}))

vi.mock("../src/base.service", () => ({
  BaseService: class {},
}))

vi.mock("../src/workspace-lifecycle/campaign-cleanup", () => ({
  cancelInFlightBroadcastsForWorkspace:
    cancelInFlightBroadcastsForWorkspaceMock,
  completeActiveSequenceEnrollmentsForWorkspace:
    completeActiveSequenceEnrollmentsForWorkspaceMock,
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: {
    listWithIntegrationsByWorkspace: vi.fn(),
  },
}))

vi.mock("../src/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: loggerWarnMock,
  },
}))

beforeEach(() => {
  vi.clearAllMocks()
  order.length = 0
  transactionMock.mockImplementation(
    async (callback: (tx: unknown) => Promise<unknown>) => {
      const result = await callback({})
      order.push("tx-done")
      return result
    },
  )
  cancelInFlightBroadcastsForWorkspaceMock.mockImplementation(() => {
    order.push("broadcast")
    return Promise.resolve(2)
  })
  completeActiveSequenceEnrollmentsForWorkspaceMock.mockImplementation(() => {
    order.push("enrollments")
    return Promise.resolve(3)
  })
  cancelPendingDispatchesForWorkspaceMock.mockImplementation(() => {
    order.push("dispatches")
    return Promise.resolve([{ id: "dispatch-1", bucket: 1 }])
  })
  removeDispatchesFromScheduleMock.mockImplementation(() => {
    order.push("remove")
    return Promise.resolve()
  })
})

test("cancelInFlightCampaigns runs cleanup in one transaction and removes Redis entries after commit", async () => {
  const { workspaceLifecycleService } = await import(
    "../src/workspace-lifecycle/service"
  )

  const result =
    await workspaceLifecycleService.cancelInFlightCampaigns("workspace-1")

  expect(result).toEqual([{ id: "dispatch-1", bucket: 1 }])
  expect(transactionMock).toHaveBeenCalledOnce()
  expect(cancelInFlightBroadcastsForWorkspaceMock).toHaveBeenCalledWith({
    tx: {},
    workspaceId: "workspace-1",
  })
  expect(
    completeActiveSequenceEnrollmentsForWorkspaceMock,
  ).toHaveBeenCalledWith({
    tx: {},
    workspaceId: "workspace-1",
  })
  expect(cancelPendingDispatchesForWorkspaceMock).toHaveBeenCalledWith({
    client: {},
    removeFromSchedule: false,
    workspaceId: "workspace-1",
  })
  expect(removeDispatchesFromScheduleMock).toHaveBeenCalledWith([
    { id: "dispatch-1", bucket: 1 },
  ])
  expect(order).toEqual([
    "broadcast",
    "enrollments",
    "dispatches",
    "tx-done",
    "remove",
  ])
})
