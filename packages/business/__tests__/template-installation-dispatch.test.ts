// @vitest-environment node

import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  listPendingIds: vi.fn(),
  enqueue: vi.fn(),
  error: vi.fn(),
}))

vi.mock("@chatbotx.io/database/repositories", () => ({
  templateInstallationRepository: {
    listPendingIds: mocks.listPendingIds,
  },
}))
vi.mock("@chatbotx.io/worker-config", () => ({
  enqueueInstallTemplate: mocks.enqueue,
}))
vi.mock("../src/logger", () => ({ logger: { error: mocks.error } }))

const { dispatchStagedInstalls } = await import(
  "../src/template/installation-dispatch"
)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.enqueue.mockResolvedValue(undefined)
})

describe("dispatchStagedInstalls", () => {
  test("enqueues every staged install of the workspace", async () => {
    mocks.listPendingIds.mockResolvedValue(["1", "2"])

    await dispatchStagedInstalls("200")

    expect(mocks.listPendingIds).toHaveBeenCalledWith("200")
    expect(mocks.enqueue).toHaveBeenCalledTimes(2)
    expect(mocks.enqueue).toHaveBeenCalledWith({
      installationId: "1",
      workspaceId: "200",
    })
  })

  test("is one empty read when nothing is staged", async () => {
    mocks.listPendingIds.mockResolvedValue([])

    await dispatchStagedInstalls("200")

    expect(mocks.enqueue).not.toHaveBeenCalled()
  })

  test("logs instead of failing when the enqueue fails (the sweep recovers it)", async () => {
    mocks.listPendingIds.mockResolvedValue(["1"])
    mocks.enqueue.mockRejectedValue(new Error("redis down"))

    await expect(dispatchStagedInstalls("200")).resolves.toBeUndefined()

    expect(mocks.error).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "200" }),
      expect.any(String),
    )
  })

  test("logs instead of failing when the read fails", async () => {
    mocks.listPendingIds.mockRejectedValue(new Error("db down"))

    await expect(dispatchStagedInstalls("200")).resolves.toBeUndefined()
    expect(mocks.enqueue).not.toHaveBeenCalled()
  })
})
