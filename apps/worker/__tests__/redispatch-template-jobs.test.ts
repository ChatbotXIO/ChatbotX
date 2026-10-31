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
}))
vi.mock("@chatbotx.io/business/template-uninstall/execute", () => ({
  templateUninstallExecuteService: { flushEffects: mocks.flushEffects },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  enqueueInstallTemplate: mocks.enqueueInstallTemplate,
  enqueueProcessAIFile: mocks.enqueueProcessAIFile,
  enqueueUninstallTemplate: mocks.enqueueUninstallTemplate,
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
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
})
