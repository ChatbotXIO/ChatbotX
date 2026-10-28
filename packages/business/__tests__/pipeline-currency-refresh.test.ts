import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listIdsPage: vi.fn(),
  queueWorkspaceRealtimeEvent: vi.fn(),
  loggerError: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  pipelineRepository: {
    listIdsPage: mocks.listIdsPage,
  },
}))
vi.mock("../src/platform/realtime-broadcast", () => ({
  queueWorkspaceRealtimeEvent: mocks.queueWorkspaceRealtimeEvent,
}))
vi.mock("../src/logger", () => ({ logger: { error: mocks.loggerError } }))

const { notifyWorkspaceCurrencyChange } = await import(
  "../src/pipeline/currency-refresh"
)

const idsFrom = (start: number, count: number) =>
  Array.from({ length: count }, (_, index) => String(start + index))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.queueWorkspaceRealtimeEvent.mockResolvedValue(undefined)
})

describe("notifyWorkspaceCurrencyChange", () => {
  test("sends the structure-changed event for each pipeline", async () => {
    mocks.listIdsPage.mockResolvedValueOnce(["11", "12"])

    await notifyWorkspaceCurrencyChange("ws-1")

    expect(mocks.queueWorkspaceRealtimeEvent).toHaveBeenCalledTimes(2)
    expect(mocks.queueWorkspaceRealtimeEvent).toHaveBeenCalledWith("ws-1", {
      eventType: "pipelineItemChanged",
      data: { pipelineId: "11", change: "updated" },
    })
    expect(mocks.listIdsPage).toHaveBeenCalledWith({
      workspaceId: "ws-1",
      afterId: null,
      limit: 200,
    })
  })

  test("a workspace without pipelines sends nothing and reads once", async () => {
    mocks.listIdsPage.mockResolvedValueOnce([])

    await notifyWorkspaceCurrencyChange("ws-1")

    expect(mocks.queueWorkspaceRealtimeEvent).not.toHaveBeenCalled()
    expect(mocks.listIdsPage).toHaveBeenCalledTimes(1)
  })

  test("pages past 200 pipelines with a keyset cursor and stops on a short page", async () => {
    mocks.listIdsPage
      .mockResolvedValueOnce(idsFrom(1, 200))
      .mockResolvedValueOnce(idsFrom(201, 200))
      .mockResolvedValueOnce(idsFrom(401, 5))

    await notifyWorkspaceCurrencyChange("ws-1")

    expect(mocks.queueWorkspaceRealtimeEvent).toHaveBeenCalledTimes(405)
    expect(
      mocks.listIdsPage.mock.calls.map(([input]) => input.afterId),
    ).toEqual([null, "200", "400"])
  })

  test("a failed read is logged and never fails the settings write", async () => {
    mocks.listIdsPage.mockRejectedValueOnce(new Error("db down"))

    await expect(notifyWorkspaceCurrencyChange("ws-1")).resolves.toBeUndefined()

    expect(mocks.loggerError).toHaveBeenCalledTimes(1)
  })
})
