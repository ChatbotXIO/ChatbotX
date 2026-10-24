import { beforeEach, expect, test, vi } from "vitest"

const order: string[] = []
const transactionMock = vi.fn()
const cancelInFlightBroadcastsForWorkspaceMock = vi.fn()
const completeActiveSequenceEnrollmentsForWorkspaceMock = vi.fn()
const cancelPendingDispatchesForWorkspaceMock = vi.fn()
const removeDispatchesFromScheduleMock = vi.fn()
const cancelSmartDelaysForWorkspaceMock = vi.fn()
const loggerWarnMock = vi.fn()
const listWithIntegrationsByWorkspaceMock = vi.fn()
const tearDownForIntegrationMock = vi.fn()
const findByInboxIdMock = vi.fn()
const connectionTransitionMock = vi.fn()

vi.mock("@chatbotx.io/database/client", () => ({
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  sql: Object.assign((strings: TemplateStringsArray) => ({ strings }), {
    raw: vi.fn((value: string) => value),
  }),
  db: {
    transaction: transactionMock,
  },
}))

vi.mock("@chatbotx.io/sequence-scheduler/dispatch-cancel", () => ({
  cancelPendingDispatchBatch: cancelPendingDispatchesForWorkspaceMock,
  cancelPendingDispatchesForWorkspace: cancelPendingDispatchesForWorkspaceMock,
  MAX_WORKSPACE_DISPATCH_CANCEL_BATCHES: 400,
  removeDispatchesFromSchedule: removeDispatchesFromScheduleMock,
  WORKSPACE_DISPATCH_CANCEL_BATCH_SIZE: 500,
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  connectionRepository: { findByInboxId: findByInboxIdMock },
  LIVE_RUN_STATUSES: [],
  PULL_CLAIMABLE_STATUSES: [],
}))

vi.mock("../src/connection/state-service", () => ({
  connectionStateService: { transition: connectionTransitionMock },
}))

vi.mock("../src/base.service", () => ({
  BaseService: class {},
}))

vi.mock("../src/workspace-lifecycle/campaign-cleanup", () => ({
  cancelInFlightBroadcastsForWorkspace:
    cancelInFlightBroadcastsForWorkspaceMock,
  completeActiveSequenceEnrollmentsForWorkspace:
    completeActiveSequenceEnrollmentsForWorkspaceMock,
  MAX_SEQUENCE_ENROLLMENT_CANCEL_BATCHES: 400,
  SEQUENCE_ENROLLMENT_CANCEL_BATCH_SIZE: 500,
}))

vi.mock("../src/workspace-lifecycle/smart-delay-cleanup", () => ({
  cancelSmartDelaysForWorkspace: cancelSmartDelaysForWorkspaceMock,
}))

vi.mock("../src/inbox/service", () => ({
  inboxService: {
    disconnect: vi.fn(),
    listWithIntegrationsByWorkspace: listWithIntegrationsByWorkspaceMock,
  },
}))

vi.mock("../src/coexist/service", () => ({
  coexistService: {
    tearDownForIntegration: tearDownForIntegrationMock,
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
      const result = await callback({
        execute: vi.fn().mockResolvedValue({ rowCount: 0 }),
      })
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
    return Promise.resolve([{ bucket: 1, id: "dispatch-1" }])
  })
  removeDispatchesFromScheduleMock.mockImplementation(() => {
    order.push("remove")
    return Promise.resolve()
  })
  cancelSmartDelaysForWorkspaceMock.mockImplementation(() => {
    order.push("smart-delays")
    return Promise.resolve(7)
  })
  listWithIntegrationsByWorkspaceMock.mockResolvedValue([])
  tearDownForIntegrationMock.mockResolvedValue(undefined)
  findByInboxIdMock.mockResolvedValue(undefined)
  connectionTransitionMock.mockResolvedValue(undefined)
})

test("freezeWorkspaceRuntime keeps the transaction to broadcasts and drains independent runtime sources after commit", {
  timeout: 60_000,
}, async () => {
  // service.ts pulls in a dozen+ unmocked integration services (Klaviyo,
  // SendGrid, OpenAI, ...); the one-time esbuild transform on this first
  // `await import` can take several seconds under CPU contention (e.g.
  // `turbo run test` fanning out across the whole monorepo) — a generous
  // timeout avoids flaking under load without changing test behavior.
  const { workspaceLifecycleService } = await import(
    "../src/workspace-lifecycle/service"
  )

  await workspaceLifecycleService.freezeWorkspaceRuntime("workspace-1")

  expect(transactionMock).toHaveBeenCalledTimes(3)
  expect(cancelInFlightBroadcastsForWorkspaceMock).toHaveBeenCalledWith(
    expect.objectContaining({
      workspaceId: "workspace-1",
    }),
  )
  expect(
    completeActiveSequenceEnrollmentsForWorkspaceMock,
  ).toHaveBeenCalledWith(
    expect.objectContaining({
      workspaceId: "workspace-1",
    }),
  )
  expect(cancelPendingDispatchesForWorkspaceMock).toHaveBeenCalledWith(
    expect.objectContaining({
      workspaceId: "workspace-1",
    }),
  )
  expect(removeDispatchesFromScheduleMock).toHaveBeenCalledWith([
    { bucket: 1, id: "dispatch-1" },
  ])
  expect(cancelSmartDelaysForWorkspaceMock).toHaveBeenCalledWith({
    workspaceId: "workspace-1",
  })
  expect(order).toEqual([
    "broadcast",
    "tx-done",
    "enrollments",
    "tx-done",
    "dispatches",
    "tx-done",
    "remove",
    "smart-delays",
  ])
})

test("freezeWorkspaceRuntime still cancels smart delays when dispatch cleanup fails", async () => {
  // Broadcasts/sequences and wait steps are independent runtime sources: a
  // Redis failure on one must not leave the other armed.
  cancelPendingDispatchesForWorkspaceMock.mockRejectedValueOnce(
    new Error("redis down"),
  )

  const { workspaceLifecycleService } = await import(
    "../src/workspace-lifecycle/service"
  )

  await workspaceLifecycleService.freezeWorkspaceRuntime("workspace-1")

  expect(loggerWarnMock).toHaveBeenCalledOnce()
  expect(cancelSmartDelaysForWorkspaceMock).toHaveBeenCalledWith({
    workspaceId: "workspace-1",
  })
})

test("freezeWorkspaceRuntime does not throw when smart-delay cancellation fails", async () => {
  cancelSmartDelaysForWorkspaceMock.mockRejectedValueOnce(
    new Error("redis down"),
  )

  const { workspaceLifecycleService } = await import(
    "../src/workspace-lifecycle/service"
  )

  await expect(
    workspaceLifecycleService.freezeWorkspaceRuntime("workspace-1"),
  ).resolves.toBeUndefined()
  expect(loggerWarnMock).toHaveBeenCalledOnce()
})

test("disconnectWorkspaceChannels tears down active native Instagram coexist runs", async () => {
  const deleteWhereMock = vi.fn().mockResolvedValue(undefined)
  const deleteMock = vi.fn(() => ({ where: deleteWhereMock }))
  const tx = { delete: deleteMock }
  listWithIntegrationsByWorkspaceMock.mockResolvedValue([
    {
      id: "inbox-ig-1",
      channel: "instagram",
      workspaceId: "workspace-1",
      integrationInstagram: {
        id: "integration-ig-1",
        auth: { tokens: { accessToken: "token" } },
        type: "instagram",
      },
    },
  ])

  const { workspaceLifecycleService } = await import(
    "../src/workspace-lifecycle/service"
  )

  await workspaceLifecycleService.disconnectWorkspaceChannels({
    workspaceId: "workspace-1",
    ownerId: "owner-1",
    teardownLevel: "disconnect",
    reason: "manual",
    tx: tx as never,
  })

  expect(tearDownForIntegrationMock).toHaveBeenCalledWith({
    workspaceId: "workspace-1",
    integrationId: "integration-ig-1",
    channel: "instagram",
    currentError: "Integration disconnected",
    tx,
  })
})

test("disconnectWorkspaceChannels does not apply native coexist teardown to instagram-facebook", async () => {
  const deleteWhereMock = vi.fn().mockResolvedValue(undefined)
  const deleteMock = vi.fn(() => ({ where: deleteWhereMock }))
  const tx = { delete: deleteMock }
  listWithIntegrationsByWorkspaceMock.mockResolvedValue([
    {
      id: "inbox-igfb-1",
      channel: "instagram",
      workspaceId: "workspace-1",
      integrationInstagram: {
        id: "integration-igfb-1",
        auth: { tokens: { accessToken: "token" } },
        type: "facebook",
      },
    },
  ])

  const { workspaceLifecycleService } = await import(
    "../src/workspace-lifecycle/service"
  )

  await workspaceLifecycleService.disconnectWorkspaceChannels({
    workspaceId: "workspace-1",
    ownerId: "owner-1",
    teardownLevel: "disconnect",
    reason: "manual",
    tx: tx as never,
  })

  expect(tearDownForIntegrationMock).not.toHaveBeenCalled()
})
