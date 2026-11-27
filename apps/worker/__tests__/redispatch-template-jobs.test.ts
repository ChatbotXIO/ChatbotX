// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  abandonUninstalls: vi.fn(),
  abandonStale: vi.fn(),
  cleanupFailedObjects: vi.fn(),
  listPendingPublishEffects: vi.fn(),
  flushPublishEffects: vi.fn(),
  listStale: vi.fn(),
  enqueueInstallTemplate: vi.fn(),
  enqueueProcessAIFile: vi.fn(),
  listForSweep: vi.fn(),
  listUninstallStale: vi.fn(),
  listUninstallEffects: vi.fn(),
  finalizeStuckOperations: vi.fn(),
  flushEffects: vi.fn(),
  deliverNotices: vi.fn(),
  enqueueUninstallTemplate: vi.fn(),
  logError: vi.fn(),
  abandonSyncs: vi.fn(),
  listUnfinishedSyncs: vi.fn(),
  listFanOuts: vi.fn(),
  enqueueSync: vi.fn(),
  enqueueFanOut: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  templateAiFileDispatchService: { listForSweep: mocks.listForSweep },
  templateInstallService: {
    abandonStale: mocks.abandonStale,
    cleanupFailedObjects: mocks.cleanupFailedObjects,
    listPendingPublishEffects: mocks.listPendingPublishEffects,
    flushPublishEffects: mocks.flushPublishEffects,
    listStale: mocks.listStale,
  },
  templateUninstallSweepService: {
    abandonStale: mocks.abandonUninstalls,
    listStale: mocks.listUninstallStale,
    listPendingEffects: mocks.listUninstallEffects,
    finalizeStuckOperations: mocks.finalizeStuckOperations,
  },
  templateUninstallNoticeService: { deliverPending: mocks.deliverNotices },
  templateSyncRequestService: {
    abandonStale: mocks.abandonSyncs,
    listUnfinished: mocks.listUnfinishedSyncs,
    listTemplatesNeedingFanOut: mocks.listFanOuts,
  },
}))
vi.mock("@chatbotx.io/business/template-uninstall/execute", () => ({
  templateUninstallExecuteService: { flushEffects: mocks.flushEffects },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  enqueueInstallTemplate: mocks.enqueueInstallTemplate,
  enqueueProcessAIFile: mocks.enqueueProcessAIFile,
  enqueueUninstallTemplate: mocks.enqueueUninstallTemplate,
  enqueueSyncTemplateInstallation: mocks.enqueueSync,
  enqueueFanOutTemplateUpdate: mocks.enqueueFanOut,
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: mocks.logError,
  }),
}))

const { redispatchTemplateJobs } = await import(
  "../src/schedule/handlers/redispatch-template-jobs"
)

describe("redispatchTemplateJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.abandonStale.mockResolvedValue(0)
    mocks.cleanupFailedObjects.mockResolvedValue(0)
    mocks.listPendingPublishEffects.mockResolvedValue([])
    mocks.enqueueInstallTemplate.mockResolvedValue(undefined)
    mocks.enqueueProcessAIFile.mockResolvedValue(undefined)
    mocks.listForSweep.mockResolvedValue({ redispatch: [], expired: 0 })
    mocks.listUninstallStale.mockResolvedValue([])
    mocks.abandonUninstalls.mockResolvedValue(0)
    mocks.listUninstallEffects.mockResolvedValue([])
    mocks.enqueueUninstallTemplate.mockResolvedValue(undefined)
    mocks.deliverNotices.mockResolvedValue(0)
    mocks.abandonSyncs.mockResolvedValue(0)
    mocks.listUnfinishedSyncs.mockResolvedValue([])
    mocks.listFanOuts.mockResolvedValue([])
  })

  // Each step recovers its own outbox rows: one failing read must not hold
  // back the rest of the sweep.
  test("a failed sync re-dispatch still runs the fan-out catch-up", async () => {
    mocks.listStale.mockResolvedValue([])
    mocks.listUnfinishedSyncs.mockRejectedValue(new Error("db down"))
    mocks.listFanOuts.mockResolvedValue([{ templateId: "t1", version: 2 }])

    await redispatchTemplateJobs()

    expect(mocks.enqueueFanOut).toHaveBeenCalledWith(
      { templateId: "t1", version: 2 },
      "interactive",
    )
    expect(mocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Template sync re-dispatch failed",
    )
  })

  test("re-enqueues unfinished syncs in the interactive lane, aging what waited past its grace", async () => {
    mocks.listStale.mockResolvedValue([])
    mocks.enqueueSync.mockResolvedValue(undefined)
    mocks.listUnfinishedSyncs.mockResolvedValue([
      { id: "s1", workspaceId: "w1" },
    ])

    await redispatchTemplateJobs()

    expect(mocks.enqueueSync).toHaveBeenCalledWith(
      { syncId: "s1", workspaceId: "w1" },
      "interactive",
    )
  })

  test("a failed uninstall re-dispatch still runs effects, finalization and notices", async () => {
    mocks.listStale.mockResolvedValue([])
    mocks.listUninstallStale.mockRejectedValue(new Error("db down"))
    mocks.listUninstallEffects.mockResolvedValue([
      { id: "i2", workspaceId: "w1" },
    ])

    await redispatchTemplateJobs()

    expect(mocks.flushEffects).toHaveBeenCalledWith("i2")
    expect(mocks.finalizeStuckOperations).toHaveBeenCalledTimes(1)
    expect(mocks.deliverNotices).toHaveBeenCalledTimes(1)
  })

  test("a failed finalization still delivers the notices", async () => {
    mocks.listStale.mockResolvedValue([])
    mocks.finalizeStuckOperations.mockRejectedValue(new Error("db down"))

    await redispatchTemplateJobs()

    expect(mocks.deliverNotices).toHaveBeenCalledTimes(1)
  })

  test("re-enqueues stale uninstalls with their attempt and redelivers notices", async () => {
    mocks.listStale.mockResolvedValue([])
    mocks.listUninstallStale.mockResolvedValue([
      { id: "i1", workspaceId: "w1", attempt: 2 },
    ])
    mocks.listUninstallEffects.mockResolvedValue([
      { id: "i2", workspaceId: "w1" },
    ])

    await redispatchTemplateJobs()

    expect(mocks.enqueueUninstallTemplate).toHaveBeenCalledWith({
      installationId: "i1",
      workspaceId: "w1",
      attempt: 2,
    })
    expect(mocks.flushEffects).toHaveBeenCalledWith("i2")
    expect(mocks.finalizeStuckOperations).toHaveBeenCalledTimes(1)
    expect(mocks.deliverNotices).toHaveBeenCalledTimes(1)
  })

  test("closes abandoned uninstalls before it lists the ones to re-dispatch", async () => {
    mocks.listStale.mockResolvedValue([])
    mocks.listUninstallStale.mockResolvedValue([])
    mocks.abandonUninstalls.mockResolvedValue(3)

    await redispatchTemplateJobs()

    expect(mocks.abandonUninstalls).toHaveBeenCalledTimes(1)
    expect(mocks.abandonUninstalls.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.listUninstallStale.mock.invocationCallOrder[0],
    )
  })

  test("cleans staged objects of failed installs and re-runs owed after-publish effects", async () => {
    mocks.listStale.mockResolvedValue([])
    mocks.cleanupFailedObjects.mockResolvedValue(2)
    mocks.listPendingPublishEffects.mockResolvedValue([
      { id: "i1", workspaceId: "w1" },
    ])

    await redispatchTemplateJobs()

    expect(mocks.cleanupFailedObjects).toHaveBeenCalledTimes(1)
    expect(mocks.flushPublishEffects).toHaveBeenCalledWith({
      installationId: "i1",
      workspaceId: "w1",
    })
  })

  test("re-enqueues every stale installation with its workspace", async () => {
    mocks.listStale.mockResolvedValue([
      { id: "install-1", workspaceId: "ws-1" },
      { id: "install-2", workspaceId: "ws-2" },
    ])

    await redispatchTemplateJobs()

    expect(mocks.enqueueInstallTemplate).toHaveBeenCalledWith({
      installationId: "install-1",
      workspaceId: "ws-1",
    })
    expect(mocks.enqueueInstallTemplate).toHaveBeenCalledWith({
      installationId: "install-2",
      workspaceId: "ws-2",
    })
  })

  test("closes abandoned installations before listing the rest", async () => {
    mocks.abandonStale.mockResolvedValue(3)
    mocks.listStale.mockResolvedValue([])

    await redispatchTemplateJobs()

    expect(mocks.abandonStale).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueInstallTemplate).not.toHaveBeenCalled()
  })

  test("one failed enqueue does not stop the others", async () => {
    mocks.listStale.mockResolvedValue([
      { id: "install-1", workspaceId: "ws-1" },
      { id: "install-2", workspaceId: "ws-2" },
    ])
    mocks.enqueueInstallTemplate.mockRejectedValueOnce(new Error("redis down"))

    await expect(redispatchTemplateJobs()).resolves.toBeUndefined()
    expect(mocks.enqueueInstallTemplate).toHaveBeenCalledTimes(2)
  })

  test("re-enqueues the queued AI files of installs, and tolerates one failing", async () => {
    mocks.listStale.mockResolvedValue([])
    mocks.listForSweep.mockResolvedValue({
      redispatch: [
        { aiFileId: "f1", runId: "r1" },
        { aiFileId: "f2", runId: "r2" },
      ],
      expired: 0,
    })
    mocks.enqueueProcessAIFile.mockRejectedValueOnce(new Error("redis"))

    await expect(redispatchTemplateJobs()).resolves.toBeUndefined()

    expect(mocks.enqueueProcessAIFile).toHaveBeenCalledWith({
      aiFileId: "f1",
      runId: "r1",
    })
    expect(mocks.enqueueProcessAIFile).toHaveBeenCalledWith({
      aiFileId: "f2",
      runId: "r2",
    })
  })

  test("a failing abandon step does not stop the cleanup or the re-dispatch", async () => {
    mocks.abandonStale.mockRejectedValue(new Error("db down"))
    mocks.listStale.mockResolvedValue([
      { id: "install-1", workspaceId: "ws-1" },
    ])

    await expect(redispatchTemplateJobs()).resolves.toBeUndefined()

    expect(mocks.cleanupFailedObjects).toHaveBeenCalledTimes(1)
    expect(mocks.enqueueInstallTemplate).toHaveBeenCalledTimes(1)
    expect(mocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Template installation abandon sweep failed",
    )
  })

  test("a failing re-dispatch listing is logged, not thrown", async () => {
    mocks.listStale.mockRejectedValue(new Error("db down"))

    await expect(redispatchTemplateJobs()).resolves.toBeUndefined()

    expect(mocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      "Template installation re-dispatch failed",
    )
  })

  test("logs the owed after-publish effects that failed", async () => {
    mocks.listStale.mockResolvedValue([])
    mocks.listPendingPublishEffects.mockResolvedValue([
      { id: "i1", workspaceId: "w1" },
    ])
    mocks.flushPublishEffects.mockRejectedValueOnce(new Error("boom"))

    await redispatchTemplateJobs()

    expect(mocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({ failed: 1, err: expect.any(Error) }),
      "Could not run some owed after-publish effects",
    )
  })

  test("logs the owed uninstall effects that failed", async () => {
    mocks.listStale.mockResolvedValue([])
    mocks.listUninstallEffects.mockResolvedValue([
      { id: "i2", workspaceId: "w1" },
    ])
    mocks.flushEffects.mockRejectedValueOnce(new Error("boom"))

    await redispatchTemplateJobs()

    expect(mocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({ failed: 1 }),
      "Could not run some owed uninstall effects",
    )
  })
})
