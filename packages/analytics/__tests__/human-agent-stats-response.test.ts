import { beforeEach, describe, expect, test, vi } from "vitest"

const execute = vi.fn()
const findMembers = vi.fn()
const getAssignedByAdmin = vi.fn()
const getAveragesByAdmin = vi.fn()

vi.mock("@chatbotx.io/database/client", async () => ({
  db: { execute, query: { workspaceMemberModel: { findMany: findMembers } } },
  sql: (await import("./helpers/fake-sql")).fakeSql,
}))
vi.mock("@chatbotx.io/database/queries/date-bucket", () => ({
  resolvedTimezone: vi.fn(),
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  analyticsMessageEventModel: {},
}))
vi.mock("../src/repositories/postgres/conversation-stats.repository", () => ({
  conversationStatsRepository: { getAssignedByAdmin },
}))
vi.mock("../src/repositories/postgres/agent-response-stats.repository", () => ({
  agentResponseStatsRepository: { getAveragesByAdmin },
}))

const { MessageStatsRepository } = await import(
  "../src/repositories/postgres/message-stats.repository"
)
const repository = new MessageStatsRepository()

const range = {
  workspaceId: "ws-1",
  from: new Date("2026-01-01T00:00:00.000Z"),
  to: new Date("2026-01-03T00:00:00.000Z"),
  timezone: "UTC",
}

const member = (userId: string, name: string) => ({
  userId,
  user: { id: userId, name, email: `${name}@example.com` },
})

beforeEach(() => {
  vi.clearAllMocks()
  execute.mockResolvedValue({ rows: [] })
  getAssignedByAdmin.mockResolvedValue([])
})

describe("MessageStatsRepository.getHumanAgentStats response-time merge", () => {
  test("merges averages by adminId over current members and nulls members without data", async () => {
    findMembers.mockResolvedValue([member("1", "ann"), member("2", "bob")])
    getAveragesByAdmin.mockResolvedValue([
      {
        adminId: "1",
        avgResponseSeconds: 30,
        avgWorkingResponseSeconds: 20,
        avgFirstResponseSeconds: 40,
        avgWorkingFirstResponseSeconds: null,
        responseCount: 5,
        firstResponseCount: 2,
      },
      // departed agent: not a member any more -> must not appear
      {
        adminId: "99",
        avgResponseSeconds: 1,
        avgWorkingResponseSeconds: 1,
        avgFirstResponseSeconds: 1,
        avgWorkingFirstResponseSeconds: 1,
        responseCount: 1,
        firstResponseCount: 1,
      },
    ])

    const result = await repository.getHumanAgentStats(range)

    expect(result.map((r) => r.adminId)).toEqual(["1", "2"])
    expect(result[0]).toMatchObject({
      userName: "ann",
      avgResponseSeconds: 30,
      avgWorkingResponseSeconds: 20,
      avgFirstResponseSeconds: 40,
      avgWorkingFirstResponseSeconds: null,
      responseCount: 5,
      firstResponseCount: 2,
    })
    expect(result[1]).toMatchObject({
      avgResponseSeconds: null,
      avgWorkingResponseSeconds: null,
      avgFirstResponseSeconds: null,
      avgWorkingFirstResponseSeconds: null,
      responseCount: 0,
      firstResponseCount: 0,
    })
    expect(getAveragesByAdmin).toHaveBeenCalledWith(range)
  })
})
