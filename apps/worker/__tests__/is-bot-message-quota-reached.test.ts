import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  isAtLimit: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  quotaEnforcementService: { isAtLimit: mocks.isAtLimit },
  workspaceService: { find: mocks.find },
}))

import { isBotMessageQuotaReached } from "../src/lib/is-bot-message-quota-reached"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.find.mockResolvedValue({ ownerId: "owner-1" })
  mocks.isAtLimit.mockResolvedValue(false)
})

describe("isBotMessageQuotaReached", () => {
  test("returns true when either live bot message limit is reached", async () => {
    mocks.isAtLimit.mockImplementation(
      async ({ metric }: { metric: string }) => metric === "monthlyBotMessages",
    )

    await expect(isBotMessageQuotaReached("workspace-1")).resolves.toBe(true)

    expect(mocks.isAtLimit).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "monthlyBotMessages",
    })
    expect(mocks.isAtLimit).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "botMessages",
    })
  })

  test("allows sends below both limits, including unlimited limits", async () => {
    await expect(isBotMessageQuotaReached("workspace-1")).resolves.toBe(false)

    expect(mocks.isAtLimit).toHaveBeenCalledTimes(2)
  })

  test("fails open when the workspace cannot be resolved", async () => {
    mocks.find.mockResolvedValue(undefined)

    await expect(isBotMessageQuotaReached("workspace-1")).resolves.toBe(false)

    expect(mocks.isAtLimit).not.toHaveBeenCalled()
  })

  test("fails open when no workspace id is available", async () => {
    await expect(isBotMessageQuotaReached(undefined)).resolves.toBe(false)

    expect(mocks.find).not.toHaveBeenCalled()
  })
})
