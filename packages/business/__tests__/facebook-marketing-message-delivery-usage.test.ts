import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({ charge: vi.fn() }))

vi.mock("../src/message-usage/service", () => ({
  messageUsageService: { charge: mocks.charge },
}))

const { recordMarketingMessageUsage } = await import(
  "../src/facebook-marketing-message-delivery/usage"
)

describe("recordMarketingMessageUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.charge.mockResolvedValue(undefined)
  })

  test("charges the messages through the shared message usage service", async () => {
    await recordMarketingMessageUsage({ count: 3, workspaceId: "ws-1" })

    expect(mocks.charge).toHaveBeenCalledTimes(1)
    expect(mocks.charge).toHaveBeenCalledWith({ count: 3, workspaceId: "ws-1" })
  })

  test("propagates a charge failure to the caller", async () => {
    const failure = new Error("charge failed")
    mocks.charge.mockRejectedValue(failure)

    await expect(
      recordMarketingMessageUsage({ count: 1, workspaceId: "ws-1" }),
    ).rejects.toBe(failure)
  })
})
