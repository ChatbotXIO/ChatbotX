import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  incrementBy: vi.fn(),
  recordEvents: vi.fn(),
  findById: vi.fn(),
}))

vi.mock("@chatbotx.io/analytics", () => ({
  messageAnalyticsService: { recordEvents: mocks.recordEvents },
}))
vi.mock("@chatbotx.io/business", () => ({
  quotaEnforcementService: { incrementBy: mocks.incrementBy },
  workspaceService: { findById: mocks.findById },
}))
vi.mock("../src/lib/logger", () => ({
  logger: { error: vi.fn() },
}))

import { handleBotMessageSent } from "../src/events/analytics/message"

const payload = (workspaceId: string) => ({
  workspaceId,
  contactId: `contact-${workspaceId}`,
  occurredAt: "2026-07-20T00:00:00.000Z",
  eventType: "message:bot_sent" as const,
})

describe("handleBotMessageSent quota accounting", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.recordEvents.mockResolvedValue(undefined)
    mocks.incrementBy.mockResolvedValue(undefined)
    mocks.findById.mockImplementation(({ id }: { id: string }) =>
      Promise.resolve({ ownerId: `owner-${id}` }),
    )
  })

  it("groups by workspace and increments both lifetime and monthly counters", async () => {
    await handleBotMessageSent([
      payload("workspace-1"),
      payload("workspace-1"),
      payload("workspace-2"),
    ])

    expect(mocks.incrementBy).toHaveBeenCalledTimes(4)
    expect(mocks.incrementBy).toHaveBeenCalledWith({
      userId: "owner-workspace-1",
      metric: "botMessages",
      count: 2,
    })
    expect(mocks.incrementBy).toHaveBeenCalledWith({
      userId: "owner-workspace-2",
      metric: "botMessages",
      count: 1,
    })
    expect(mocks.incrementBy).toHaveBeenCalledWith({
      userId: "owner-workspace-1",
      metric: "monthlyBotMessages",
      count: 2,
    })
    expect(mocks.incrementBy).toHaveBeenCalledWith({
      userId: "owner-workspace-2",
      metric: "monthlyBotMessages",
      count: 1,
    })
  })

  it("swallows quota failures after recording analytics", async () => {
    mocks.incrementBy.mockRejectedValue(new Error("quota unavailable"))

    await expect(handleBotMessageSent([payload("workspace-1")])).resolves.toBe(
      undefined,
    )
    expect(mocks.recordEvents).toHaveBeenCalledOnce()
  })

  it("isolates a failing workspace so others still get incremented", async () => {
    mocks.findById.mockImplementation(({ id }: { id: string }) => {
      if (id === "workspace-1") {
        return Promise.reject(new Error("workspace not found"))
      }
      return Promise.resolve({ ownerId: `owner-${id}` })
    })

    await expect(
      handleBotMessageSent([payload("workspace-1"), payload("workspace-2")]),
    ).resolves.toBe(undefined)

    expect(mocks.incrementBy).toHaveBeenCalledTimes(2)
    expect(mocks.incrementBy).toHaveBeenCalledWith({
      userId: "owner-workspace-2",
      metric: "botMessages",
      count: 1,
    })
    expect(mocks.recordEvents).toHaveBeenCalledOnce()
  })
})
