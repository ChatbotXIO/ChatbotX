import { beforeEach, describe, expect, test, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  findById: vi.fn(),
  incrementBy: vi.fn(),
  isAtLimit: vi.fn(),
  ledgerIncrement: vi.fn(),
  usageIncrement: vi.fn(),
}))

vi.mock("../src/workspace/service", () => ({
  workspaceService: { find: mocks.find, findById: mocks.findById },
}))
vi.mock("../src/quota-enforcement/service", () => ({
  quotaEnforcementService: {
    incrementBy: mocks.incrementBy,
    isAtLimit: mocks.isAtLimit,
  },
}))
vi.mock("../src/workspace-usage/service", () => ({
  workspaceUsageService: { increment: mocks.usageIncrement },
}))
vi.mock("../src/workspace-bot-message-usage/service", () => ({
  workspaceBotMessageUsageService: { increment: mocks.ledgerIncrement },
}))
vi.mock("../src/logger", () => ({ logger: { error: vi.fn() } }))

const { messageUsageService, MESSAGE_QUOTA_EXCEEDED } = await import(
  "../src/message-usage/service"
)

const workspace = { id: "ws-1", ownerId: "owner-1", tenantId: "t-1" }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.find.mockResolvedValue(workspace)
  mocks.findById.mockResolvedValue(workspace)
  mocks.isAtLimit.mockResolvedValue(false)
})

describe("messageUsageService", () => {
  test("has room unless the lifetime or the monthly limit is reached", async () => {
    expect(await messageUsageService.hasRoom("ws-1")).toBe(true)
    mocks.isAtLimit.mockImplementation(
      async ({ metric }: { metric: string }) => metric === "monthlyBotMessages",
    )
    expect(await messageUsageService.hasRoom("ws-1")).toBe(false)
  })

  test("a workspace without an owner is not attributed and never blocks", async () => {
    mocks.find.mockResolvedValue(null)
    expect(await messageUsageService.hasRoom("ws-1")).toBe(true)
    expect(mocks.isAtLimit).not.toHaveBeenCalled()
  })

  test("assertRoom throws a 429 postMessageQuotaExceeded at the limit", async () => {
    mocks.isAtLimit.mockResolvedValue(true)
    await expect(messageUsageService.assertRoom("ws-1")).rejects.toMatchObject({
      code: MESSAGE_QUOTA_EXCEEDED,
      httpStatusCode: 429,
    })
  })

  test("charge counts like a chat send: both owner metrics, the workspace counter and the period ledger", async () => {
    await messageUsageService.charge({ count: 2, workspaceId: "ws-1" })
    expect(mocks.incrementBy).toHaveBeenCalledWith({
      count: 2,
      metric: "botMessages",
      userId: "owner-1",
    })
    expect(mocks.incrementBy).toHaveBeenCalledWith({
      count: 2,
      metric: "monthlyBotMessages",
      userId: "owner-1",
    })
    expect(mocks.usageIncrement).toHaveBeenCalledWith("ws-1", "botMessages", 2)
    expect(mocks.ledgerIncrement).toHaveBeenCalledWith({
      count: 2,
      ownerId: "owner-1",
      tenantId: "t-1",
      workspaceId: "ws-1",
    })
  })

  test("a zero count charges nothing", async () => {
    await messageUsageService.charge({ count: 0, workspaceId: "ws-1" })
    expect(mocks.incrementBy).not.toHaveBeenCalled()
  })

  test("a failing period ledger write does not fail the charge", async () => {
    mocks.ledgerIncrement.mockRejectedValue(new Error("down"))
    await expect(
      messageUsageService.charge({ count: 1, workspaceId: "ws-1" }),
    ).resolves.toBeUndefined()
  })

  test("a failing counter is logged, never thrown, and the other counters still count (no double charge on retry)", async () => {
    mocks.incrementBy.mockRejectedValueOnce(new Error("redis down"))
    await expect(
      messageUsageService.charge({ count: 1, workspaceId: "ws-1" }),
    ).resolves.toBeUndefined()
    expect(mocks.incrementBy).toHaveBeenCalledTimes(2)
    expect(mocks.usageIncrement).toHaveBeenCalledTimes(1)
    expect(mocks.ledgerIncrement).toHaveBeenCalledTimes(1)
  })

  test("a workspace that cannot be read throws before anything is counted, so the caller may retry", async () => {
    mocks.findById.mockRejectedValue(new Error("db down"))
    await expect(
      messageUsageService.charge({ count: 1, workspaceId: "ws-1" }),
    ).rejects.toThrow("db down")
    expect(mocks.incrementBy).not.toHaveBeenCalled()
  })
})
