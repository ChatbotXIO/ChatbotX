import { beforeEach, describe, expect, test, vi } from "vitest"

const deactivateOwnerWorkspaces = vi.fn()
const markChannelsTornDown = vi.fn()
const error = vi.fn()

vi.mock("@chatbotx.io/business", () => ({
  userQuotaService: { markChannelsTornDown },
  workspaceLifecycleService: { deactivateOwnerWorkspaces },
}))
vi.mock("@chatbotx.io/logger", () => ({
  getChildLogger: () => ({ error }),
}))
vi.mock("../src/services/integrations", () => ({
  allIntegrations: ["integration"],
}))

const { teardownExpiredTrial } = await import(
  "../src/schedule/handlers/teardown-expired-trial"
)

beforeEach(() => {
  deactivateOwnerWorkspaces.mockReset()
  markChannelsTornDown.mockReset()
  error.mockReset()
  deactivateOwnerWorkspaces.mockResolvedValue(undefined)
  markChannelsTornDown.mockResolvedValue(undefined)
})

describe("teardownExpiredTrial", () => {
  test("deactivates the owner and marks channels as torn down", async () => {
    await teardownExpiredTrial("owner-1")

    expect(deactivateOwnerWorkspaces).toHaveBeenCalledWith({
      ownerId: "owner-1",
      integrations: ["integration"],
      teardownLevel: "disconnect",
    })
    expect(markChannelsTornDown).toHaveBeenCalledWith("owner-1")
  })

  test("logs and rethrows teardown errors without marking the owner", async () => {
    const failure = new Error("failed")
    deactivateOwnerWorkspaces.mockRejectedValue(failure)

    await expect(teardownExpiredTrial("owner-1")).rejects.toBe(failure)

    expect(error).toHaveBeenCalledWith(
      { err: failure, ownerId: "owner-1" },
      "teardownExpiredTrial: owner teardown failed",
    )
    expect(markChannelsTornDown).not.toHaveBeenCalled()
  })
})
