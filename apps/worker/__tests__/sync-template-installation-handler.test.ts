// @vitest-environment node
import { UnrecoverableError } from "bullmq"
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  run: vi.fn(),
  release: vi.fn(),
  fail: vi.fn(),
  closeUnclaimed: vi.fn(),
  fanOutAutoUpdate: vi.fn(),
  enqueueSync: vi.fn(),
  enqueueFanOut: vi.fn(),
  listQueuedForInstallation: vi.fn(),
  enqueueProcessAIFile: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  templateAiFileDispatchService: {
    listQueuedForInstallation: mocks.listQueuedForInstallation,
  },
  templateSyncRequestService: {
    closeUnclaimed: mocks.closeUnclaimed,
    fanOutAutoUpdate: mocks.fanOutAutoUpdate,
  },
}))
vi.mock("@chatbotx.io/business/template-sync/execute", () => ({
  templateSyncExecuteService: {
    claim: mocks.claim,
    run: mocks.run,
    release: mocks.release,
    fail: mocks.fail,
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  enqueueSyncTemplateInstallation: mocks.enqueueSync,
  enqueueFanOutTemplateUpdate: mocks.enqueueFanOut,
  enqueueProcessAIFile: mocks.enqueueProcessAIFile,
}))
vi.mock("@chatbotx.io/business/errors", () => ({
  ChatbotXException: class ChatbotXException extends Error {
    code: string
    constructor(message: string, code = "systemError") {
      super(message)
      this.code = code
    }
  },
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}))

const { syncTemplateInstallation, skipBlockedTemplateSync } = await import(
  "../src/default/handlers/sync-template-installation"
)
const { fanOutTemplateUpdate } = await import(
  "../src/default/handlers/fan-out-template-update"
)
const { ChatbotXException } = await import("@chatbotx.io/business/errors")

const data = { syncId: "sync-1", workspaceId: "ws-1" }
const jobOn = (attemptsMade: number, attempts = 2) =>
  ({ attemptsMade, opts: { attempts } }) as never

beforeEach(() => {
  vi.clearAllMocks()
  mocks.claim.mockResolvedValue({
    claimToken: "token-1",
    sync: { id: "sync-1" },
  })
  mocks.run.mockResolvedValue(undefined)
  mocks.listQueuedForInstallation.mockResolvedValue([])
  mocks.enqueueProcessAIFile.mockResolvedValue(undefined)
})

describe("syncTemplateInstallation handler", () => {
  test("a redelivery that finds the lease taken does nothing", async () => {
    mocks.claim.mockResolvedValue(null)
    await syncTemplateInstallation(data, jobOn(0))
    expect(mocks.run).not.toHaveBeenCalled()
  })

  test("runs the claimed sync", async () => {
    await syncTemplateInstallation(data, jobOn(0))
    expect(mocks.run).toHaveBeenCalledWith({
      sync: { id: "sync-1" },
      claimToken: "token-1",
    })
  })

  test("queues the embedding jobs of AI files the sync created, after it committed", async () => {
    mocks.claim.mockResolvedValue({
      claimToken: "token-1",
      sync: { id: "sync-1", installationId: "install-1" },
    })
    mocks.listQueuedForInstallation.mockResolvedValue([
      { aiFileId: "f1", runId: "r1" },
    ])

    await syncTemplateInstallation(data, jobOn(0))

    expect(mocks.listQueuedForInstallation).toHaveBeenCalledWith("install-1")
    expect(mocks.enqueueProcessAIFile).toHaveBeenCalledWith({
      aiFileId: "f1",
      runId: "r1",
    })
    expect(mocks.run.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.enqueueProcessAIFile.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test("a failed sync queues no AI files", async () => {
    mocks.run.mockRejectedValue(new Error("boom"))
    await expect(syncTemplateInstallation(data, jobOn(0))).rejects.toThrow()
    expect(mocks.listQueuedForInstallation).not.toHaveBeenCalled()
  })

  test("a transient error releases the claim for the retry", async () => {
    mocks.run.mockRejectedValue(new Error("deadlock"))
    await expect(syncTemplateInstallation(data, jobOn(0))).rejects.toThrow(
      "deadlock",
    )
    expect(mocks.release).toHaveBeenCalledWith({
      syncId: "sync-1",
      claimToken: "token-1",
    })
    expect(mocks.fail).not.toHaveBeenCalled()
  })

  test("the final attempt records the failure", async () => {
    mocks.run.mockRejectedValue(new Error("deadlock"))
    await expect(syncTemplateInstallation(data, jobOn(1))).rejects.toThrow()
    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({
        syncId: "sync-1",
        errorCode: "templateSyncFailed",
      }),
    )
  })

  test("a permanent error fails the sync and stops retries", async () => {
    mocks.run.mockRejectedValue(
      new ChatbotXException("bad", "templatePayloadIncompatible"),
    )
    await expect(
      syncTemplateInstallation(data, jobOn(0)),
    ).rejects.toBeInstanceOf(UnrecoverableError)
    expect(mocks.fail).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "templatePayloadIncompatible" }),
    )
  })

  test("a blocked owner closes the row so the sweep skips it", async () => {
    await skipBlockedTemplateSync(data)
    expect(mocks.closeUnclaimed).toHaveBeenCalledWith({
      syncId: "sync-1",
      status: "skipped",
      errorCode: "workspaceOwnerBlocked",
    })
  })
})

describe("fanOutTemplateUpdate handler", () => {
  const fanOut = {
    templateId: "tpl-1",
    workspaceId: "ws-1",
    version: 3,
  }

  test("enqueues each new sync under its own job", async () => {
    mocks.fanOutAutoUpdate.mockResolvedValue({
      syncs: [
        { id: "s1", workspaceId: "w1" },
        { id: "s2", workspaceId: "w2" },
      ],
      nextAfterId: null,
    })
    mocks.enqueueSync.mockResolvedValue(undefined)
    await fanOutTemplateUpdate(fanOut)

    expect(mocks.enqueueSync).toHaveBeenCalledTimes(2)
    expect(mocks.enqueueSync).toHaveBeenCalledWith({
      syncId: "s1",
      workspaceId: "w1",
    })
    expect(mocks.enqueueFanOut).not.toHaveBeenCalled()
  })

  test("continues with the next batch from the cursor", async () => {
    mocks.fanOutAutoUpdate.mockResolvedValue({ syncs: [], nextAfterId: "i500" })
    await fanOutTemplateUpdate(fanOut)
    expect(mocks.enqueueFanOut).toHaveBeenCalledWith({
      ...fanOut,
      afterId: "i500",
    })
  })

  test("a failed enqueue does not stop the fan-out", async () => {
    mocks.fanOutAutoUpdate.mockResolvedValue({
      syncs: [{ id: "s1", workspaceId: "w1" }],
      nextAfterId: "i500",
    })
    mocks.enqueueSync.mockRejectedValue(new Error("redis down"))
    await fanOutTemplateUpdate(fanOut)
    expect(mocks.enqueueFanOut).toHaveBeenCalledTimes(1)
  })
})
