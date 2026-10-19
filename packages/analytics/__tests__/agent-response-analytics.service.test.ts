import { beforeEach, describe, expect, test, vi } from "vitest"

const getDailyAveragesByAdmin = vi.fn()
const fetchWorkspaceMembers = vi.fn()

vi.mock("../src/repositories/postgres", () => ({
  agentResponseStatsRepository: { getDailyAveragesByAdmin },
  messageStatsRepository: { fetchWorkspaceMembers },
}))

const { AgentResponseAnalyticsService } = await import(
  "../src/services/agent-response-analytics.service"
)
const service = new AgentResponseAnalyticsService()

const range = {
  workspaceId: "ws-1",
  from: new Date("2026-01-01T00:00:00.000Z"),
  to: new Date("2026-01-03T00:00:00.000Z"),
  timezone: "Asia/Ho_Chi_Minh",
}

const measures = {
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

describe("AgentResponseAnalyticsService.getAgentResponseSeries", () => {
  test("merges member names, drops departed agents and passes the timezone through", async () => {
    getDailyAveragesByAdmin.mockResolvedValue([
      { adminId: "1", date: "2026-01-01", ...measures },
      { adminId: "99", date: "2026-01-01", ...measures },
      { adminId: "1", date: "2026-01-02", ...measures },
    ])
    fetchWorkspaceMembers.mockResolvedValue([
      { userId: "1", user: { id: "1", name: "ann", email: "ann@example.com" } },
    ])

    const rows = await service.getAgentResponseSeries(range)

    expect(getDailyAveragesByAdmin).toHaveBeenCalledWith(range)
    expect(fetchWorkspaceMembers).toHaveBeenCalledWith("ws-1")
    expect(rows).toEqual([
      {
        adminId: "1",
        workspaceId: "ws-1",
        date: "2026-01-01",
        userName: "ann",
        userEmail: "ann@example.com",
        ...measures,
      },
      {
        adminId: "1",
        workspaceId: "ws-1",
        date: "2026-01-02",
        userName: "ann",
        userEmail: "ann@example.com",
        ...measures,
      },
    ])
  })

  test("returns an empty series when there is no data", async () => {
    getDailyAveragesByAdmin.mockResolvedValue([])
    fetchWorkspaceMembers.mockResolvedValue([])
    await expect(service.getAgentResponseSeries(range)).resolves.toEqual([])
  })
})
