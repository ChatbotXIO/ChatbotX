import { call } from "@orpc/server"
import { beforeEach, describe, expect, test, vi } from "vitest"

const getAgentResponseSeries = vi.fn()

vi.mock("@chatbotx.io/analytics", () => ({
  agentResponseAnalyticsService: { getAgentResponseSeries },
  conversationAnalyticsService: {},
}))
vi.mock("../src/lib/log", () => ({
  logger: { error: vi.fn() },
}))

const { analyticsConversationRoutes } = await import(
  "../src/routes/conversation"
)

const input = {
  workspaceId: "1",
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-03T00:00:00.000Z",
  timezone: "UTC",
}

const row = {
  adminId: "5",
  workspaceId: "1",
  date: "2026-01-02",
  userName: "Ann",
  userEmail: "ann@example.com",
  avgResponseSeconds: 30,
  avgWorkingResponseSeconds: null,
  avgFirstResponseSeconds: 40,
  avgWorkingFirstResponseSeconds: null,
  responseCount: 3,
  firstResponseCount: 1,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("agentResponseSeriesAnalyticsAPI", () => {
  test("returns the service rows with merged member names and nullable averages", async () => {
    getAgentResponseSeries.mockResolvedValue([row])

    const result = await call(
      analyticsConversationRoutes.agentResponseSeriesAnalyticsAPI,
      input,
    )

    expect(getAgentResponseSeries).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "1", timezone: "UTC" }),
    )
    expect(result).toEqual({ data: [row] })
  })

  test("rethrows service errors", async () => {
    getAgentResponseSeries.mockRejectedValue(new Error("boom"))

    await expect(
      call(analyticsConversationRoutes.agentResponseSeriesAnalyticsAPI, input),
    ).rejects.toThrow("boom")
  })
})
