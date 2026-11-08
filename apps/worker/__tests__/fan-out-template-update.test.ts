// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  fanOutAutoUpdate: vi.fn(),
  enqueueSync: vi.fn(),
  enqueueFanOut: vi.fn(),
  logError: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  templateSyncRequestService: { fanOutAutoUpdate: mocks.fanOutAutoUpdate },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  enqueueSyncTemplateInstallation: mocks.enqueueSync,
  enqueueFanOutTemplateUpdate: mocks.enqueueFanOut,
}))
vi.mock("../src/lib/logger", () => ({ logger: { error: mocks.logError } }))

const { fanOutTemplateUpdate } = await import(
  "../src/default/handlers/fan-out-template-update"
)

const data = { templateId: "t1", workspaceId: "w1", version: 3 }

describe("fanOutTemplateUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.enqueueSync.mockResolvedValue(undefined)
    mocks.enqueueFanOut.mockResolvedValue(undefined)
  })

  test("enqueues every sync and continues with the next batch", async () => {
    mocks.fanOutAutoUpdate.mockResolvedValue({
      syncs: [{ id: "s1", workspaceId: "w2" }],
      nextAfterId: "s1",
    })

    await fanOutTemplateUpdate(data)

    // A fan-out sync is background work: interactive installs run first.
    expect(mocks.enqueueSync).toHaveBeenCalledWith(
      { syncId: "s1", workspaceId: "w2" },
      "background",
    )
    expect(mocks.enqueueFanOut).toHaveBeenCalledWith(
      { ...data, afterId: "s1" },
      "background",
    )
  })

  test("logs a sync that could not be enqueued and still enqueues the rest", async () => {
    mocks.fanOutAutoUpdate.mockResolvedValue({
      syncs: [
        { id: "s1", workspaceId: "w2" },
        { id: "s2", workspaceId: "w3" },
      ],
      nextAfterId: null,
    })
    mocks.enqueueSync.mockRejectedValueOnce(new Error("redis"))

    await fanOutTemplateUpdate(data)

    expect(mocks.enqueueSync).toHaveBeenCalledTimes(2)
    expect(mocks.logError).toHaveBeenCalledWith(
      expect.objectContaining({ failed: 1, templateId: "t1" }),
      "Could not enqueue some template syncs; the sweep will",
    )
  })
})
