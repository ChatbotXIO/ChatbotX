import { EVENT_BUS_MESSAGE_ID } from "@chatbotx.io/flow-config"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { renderSql } from "./helpers/fake-sql"

const execute = vi.fn()
const onConflictDoNothing = vi.fn().mockResolvedValue(undefined)
const values = vi.fn(() => ({ onConflictDoNothing }))
const insert = vi.fn(() => ({ values }))

vi.mock("@chatbotx.io/database/client", async () => ({
  db: { execute, insert, query: {} },
  sql: (await import("./helpers/fake-sql")).fakeSql,
}))
vi.mock("@chatbotx.io/database/queries/date-bucket", async () => {
  const { fakeSql: tag } = await import("./helpers/fake-sql")
  return {
    zonedDateKey: (_column: unknown, timezone: string) =>
      tag`ZONED_DAY(${timezone})`,
  }
})
vi.mock("@chatbotx.io/database/schema", () => ({
  analyticsAgentResponseEventModel: { occurredAt: {} },
}))
vi.mock("@chatbotx.io/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@chatbotx.io/utils")>()),
  createId: vi.fn(() => "generated-id"),
}))

const { AgentResponseStatsRepository } = await import(
  "../src/repositories/postgres/agent-response-stats.repository"
)
const repository = new AgentResponseStatsRepository()

const lastQuery = () => renderSql(execute.mock.calls.at(-1)?.[0])

const range = {
  workspaceId: "ws-1",
  from: new Date("2026-01-01T00:00:00.000Z"),
  to: new Date("2026-01-03T00:00:00.000Z"),
  timezone: "Asia/Ho_Chi_Minh",
}

const baseRow = {
  workspaceId: "ws-1",
  conversationId: "c-1",
  contactId: "ct-1",
  adminId: "u-1",
  occurredAt: "2026-01-01T10:00:00.000Z",
  awaitingSince: "2026-01-01T09:00:00.000Z",
  measuredFrom: "2026-01-01T09:30:00.000Z",
  responseSeconds: 1800,
  workingResponseSeconds: 600,
  isFirstResponse: true,
  workingHoursId: "wh-1",
}

beforeEach(() => {
  execute.mockReset()
  execute.mockResolvedValue({ rows: [] })
  insert.mockClear()
  values.mockClear()
  onConflictDoNothing.mockClear()
})

describe("AgentResponseStatsRepository.insertEvents", () => {
  test("inserts with onConflictDoNothing and maps defaults to null", async () => {
    await repository.insertEvents([
      { ...baseRow, eventId: "reply:m-1", workingResponseSeconds: null },
    ])

    expect(onConflictDoNothing).toHaveBeenCalledTimes(1)
    expect(values).toHaveBeenCalledWith([
      expect.objectContaining({
        eventId: "reply:m-1",
        occurredAt: new Date("2026-01-01T10:00:00.000Z"),
        workingResponseSeconds: null,
        channel: null,
        inboxId: null,
        metadata: null,
      }),
    ])
  })

  test("eventId precedence: payload eventId, then stream id, then generated", async () => {
    await repository.insertEvents([
      { ...baseRow, eventId: "reply:m-1", [EVENT_BUS_MESSAGE_ID]: "1-0" },
      { ...baseRow, eventId: null, [EVENT_BUS_MESSAGE_ID]: "2-0" },
      { ...baseRow },
    ])

    const rows = values.mock.calls[0]?.[0] as unknown as { eventId: string }[]
    expect(rows.map((r) => r.eventId)).toEqual([
      "reply:m-1",
      "2-0",
      "generated-id",
    ])
  })

  test("does nothing for an empty batch", async () => {
    await repository.insertEvents([])
    expect(insert).not.toHaveBeenCalled()
  })
})

// The four SLA measures each check that the workspace's policy is switched on.
const SLA_POLICY_PARAMS = ["ws-1", "ws-1", "ws-1", "ws-1"]

describe("AgentResponseStatsRepository.getAveragesByAdmin", () => {
  test("emits int-cast averages, FILTER measures, workspace scope and grouping", async () => {
    await repository.getAveragesByAdmin(range)
    const { text, params } = lastQuery()

    expect(text).toContain('ROUND(AVG("responseSeconds"))::int')
    expect(text).toContain('ROUND(AVG("workingResponseSeconds"))::int')
    expect(text).toContain(
      'ROUND(AVG("responseSeconds") FILTER (WHERE "isFirstResponse"))::int',
    )
    expect(text).toContain(
      'ROUND(AVG("workingResponseSeconds") FILTER (WHERE "isFirstResponse"))::int',
    )
    expect(text).toContain("COUNT(*)::int")
    expect(text).toContain('COUNT(*) FILTER (WHERE "isFirstResponse")::int')
    expect(text).toContain('FROM "AnalyticsAgentResponseEvent"')
    expect(text).toContain('WHERE "workspaceId" = ?')
    expect(text).toContain('"occurredAt" >= ? AND "occurredAt" <= ?')
    expect(text).toContain('GROUP BY "adminId"')
    expect(text).toContain('"ResponseSlaPolicy"."enabled"')
    expect(params).toEqual([...SLA_POLICY_PARAMS, "ws-1", range.from, range.to])
  })

  test("applies channel and inbox filters as bound parameters", async () => {
    await repository.getAveragesByAdmin({
      ...range,
      channels: ["messenger"],
      inboxIds: ["7"],
    })
    const { text, params } = lastQuery()

    expect(text).toContain('"channel" IN (?) AND "inboxId" IN (?)')
    expect(params).toEqual([
      ...SLA_POLICY_PARAMS,
      "ws-1",
      "messenger",
      "7",
      range.from,
      range.to,
    ])
  })

  test("maps rows, keeping null averages null and numbers numeric", async () => {
    execute.mockResolvedValue({
      rows: [
        {
          adminId: 5,
          avgResponseSeconds: "120",
          avgWorkingResponseSeconds: null,
          avgFirstResponseSeconds: null,
          avgWorkingFirstResponseSeconds: null,
          responseCount: "3",
          firstResponseCount: 0,
          responseSlaEligibleCount: "4",
          responseSlaMetCount: "3",
          firstResponseSlaEligibleCount: 0,
          firstResponseSlaMetCount: 0,
        },
      ],
    })

    await expect(repository.getAveragesByAdmin(range)).resolves.toEqual([
      {
        adminId: "5",
        avgResponseSeconds: 120,
        avgWorkingResponseSeconds: null,
        avgFirstResponseSeconds: null,
        avgWorkingFirstResponseSeconds: null,
        responseCount: 3,
        firstResponseCount: 0,
        responseSlaEligibleCount: 4,
        responseSlaMetCount: 3,
        // 3 of 4 eligible replies, one decimal; nothing eligible stays null.
        responseSlaMetPercent: 75,
        firstResponseSlaEligibleCount: 0,
        firstResponseSlaMetCount: 0,
        firstResponseSlaMetPercent: null,
      },
    ])
  })
})

describe("AgentResponseStatsRepository.getDailyAveragesByAdmin", () => {
  test("buckets by the zoned day key and groups per (admin, day)", async () => {
    execute.mockResolvedValue({
      rows: [
        {
          adminId: "u-1",
          date: "2026-01-02",
          avgResponseSeconds: 10,
          avgWorkingResponseSeconds: 5,
          avgFirstResponseSeconds: 10,
          avgWorkingFirstResponseSeconds: 5,
          responseCount: 2,
          firstResponseCount: 1,
        },
      ],
    })

    const rows = await repository.getDailyAveragesByAdmin(range)
    const { text, params } = lastQuery()

    expect(text).toContain('ZONED_DAY(?) AS "date"')
    expect(text).toContain("GROUP BY 1, 2")
    expect(text).toContain('COUNT(*) FILTER (WHERE "isFirstResponse")::int')
    expect(text).toContain('WHERE "workspaceId" = ?')
    expect(params).toEqual([
      "Asia/Ho_Chi_Minh",
      ...SLA_POLICY_PARAMS,
      "ws-1",
      range.from,
      range.to,
    ])
    expect(rows).toEqual([
      expect.objectContaining({ adminId: "u-1", date: "2026-01-02" }),
    ])
  })
})
