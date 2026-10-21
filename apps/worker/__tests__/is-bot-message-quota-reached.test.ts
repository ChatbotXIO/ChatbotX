import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  isAtLimit: vi.fn(),
  getDualRemainingSlots: vi.fn(),
}))

vi.mock("@chatbotx.io/business", () => ({
  quotaEnforcementService: {
    isAtLimit: mocks.isAtLimit,
    getDualRemainingSlots: mocks.getDualRemainingSlots,
  },
  workspaceService: { find: mocks.find },
}))

import {
  getBotMessageQuotaRemaining,
  isBotMessageQuotaReached,
} from "../src/lib/is-bot-message-quota-reached"

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

describe("getBotMessageQuotaRemaining", () => {
  const remaining = (byMetric: Record<string, number | null>) =>
    mocks.getDualRemainingSlots.mockImplementation(
      async ({ metric }: { metric: string }) => byMetric[metric],
    )

  test("returns the tighter of the monthly and lifetime limits", async () => {
    remaining({ monthlyBotMessages: 3, botMessages: 10 })

    await expect(getBotMessageQuotaRemaining("workspace-1")).resolves.toBe(3)

    expect(mocks.getDualRemainingSlots).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "monthlyBotMessages",
    })
    expect(mocks.getDualRemainingSlots).toHaveBeenCalledWith({
      userId: "owner-1",
      metric: "botMessages",
    })
  })

  test("ignores an unlimited metric", async () => {
    remaining({ monthlyBotMessages: null, botMessages: 7 })
    await expect(getBotMessageQuotaRemaining("workspace-1")).resolves.toBe(7)

    remaining({ monthlyBotMessages: 0, botMessages: null })
    await expect(getBotMessageQuotaRemaining("workspace-1")).resolves.toBe(0)
  })

  test("is unlimited when both metrics are", async () => {
    remaining({ monthlyBotMessages: null, botMessages: null })

    await expect(getBotMessageQuotaRemaining("workspace-1")).resolves.toBe(null)
  })

  test("fails open without a resolvable workspace", async () => {
    await expect(getBotMessageQuotaRemaining(undefined)).resolves.toBe(null)
    mocks.find.mockResolvedValue(undefined)
    await expect(getBotMessageQuotaRemaining("workspace-1")).resolves.toBe(null)

    expect(mocks.getDualRemainingSlots).not.toHaveBeenCalled()
  })
})
