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
vi.mock("@chatbotx.io/database/queries/date-bucket", () => ({
  resolvedTimezone: (timezone: string) => timezone,
}))
vi.mock("@chatbotx.io/database/schema", () => ({
  analyticsContactEventModel: {},
  analyticsMessageEventModel: {},
  analyticsBotMessageEventModel: {},
  analyticsConversationEventModel: {},
}))

const { ContactStatsRepository } = await import(
  "../src/repositories/postgres/contact-stats.repository"
)
const { MessageStatsRepository } = await import(
  "../src/repositories/postgres/message-stats.repository"
)
const { BotMessageStatsRepository } = await import(
  "../src/repositories/postgres/bot-message-stats.repository"
)
const { ConversationStatsRepository } = await import(
  "../src/repositories/postgres/conversation-stats.repository"
)

const lastQuery = () => renderSql(execute.mock.calls.at(-1)?.[0])

// Old range so the cagg is never eligible on its own; "recent" below covers it.
const old = {
  workspaceId: "ws-1",
  from: new Date("2026-01-01T00:00:00.000Z"),
  to: new Date("2026-01-03T00:00:00.000Z"),
  timezone: "UTC",
}
const recent = {
  ...old,
  from: new Date(Date.now() - 2 * 3600 * 1000),
  to: new Date(),
}
const filter = { channels: ["messenger" as const], inboxIds: ["7"] }
const FILTER_SQL = '"channel" IN (?) AND "inboxId" IN (?)'

beforeEach(() => {
  execute.mockReset()
  execute.mockResolvedValue({ rows: [] })
})

describe("contact stats — filtered reads", () => {
  const repository = new ContactStatsRepository()

  test("hour: filtered reads the raw table, unfiltered keeps the cagg", async () => {
    await repository.getStatsByHour({ ...recent, ...filter })
    expect(lastQuery().text).toContain('FROM "AnalyticsContactEvent"')
    expect(lastQuery().text).toContain(FILTER_SQL)
    expect(lastQuery().params).toEqual(
      expect.arrayContaining(["messenger", "7"]),
    )

    await repository.getStatsByHour(recent)
    expect(lastQuery().text).toContain("analytics_contact_events_hourly")
    expect(lastQuery().text).not.toContain('"inboxId"')
  })

  test("day: a recent filtered range skips the cagg", async () => {
    await repository.getStatsByDay({ ...recent, ...filter })
    expect(lastQuery().text).toContain('FROM "AnalyticsContactEvent"')
    expect(lastQuery().text).toContain(FILTER_SQL)

    await repository.getStatsByDay(recent)
    expect(lastQuery().text).toContain("analytics_contact_events_hourly")
  })

  test.each([
    ["getNewContactsCount"],
    ["getBlockedContactsCount"],
    ["getNewContactsPerDay"],
    ["getBlockedContactsPerDay"],
  ] as const)("%s applies the filter", async (method) => {
    await repository[method]({ ...old, ...filter })
    expect(lastQuery().text).toContain(FILTER_SQL)
  })

  test("running total applies the filter to baseline and series", async () => {
    await repository.getContactCountsPerDay({ ...old, ...filter })
    const queries = execute.mock.calls.map(([q]) => renderSql(q).text)
    const eventQueries = queries.filter((t) =>
      t.includes('FROM "AnalyticsContactEvent"'),
    )
    expect(eventQueries).toHaveLength(2)
    for (const text of eventQueries) {
      expect(text).toContain(FILTER_SQL)
    }
    // The inbox filter anchors on the per-inbox counts, filtered the same way.
    expect(
      queries.filter((t) =>
        t.includes('i."channel" IN (?) AND ics."inboxId" IN (?)'),
      ),
    ).toHaveLength(1)
  })

  test("contacts count filters by inbox channel and inbox id", async () => {
    await repository.getContactsCount({ ...old, ...filter })
    expect(lastQuery().text).toContain('i."channel" IN (?)')
    expect(lastQuery().text).toContain('ics."inboxId" IN (?)')

    await repository.getContactsCount(old)
    expect(lastQuery().text).not.toContain("IN (")
  })

  test("language dimension groups the stored language and honors the filter", async () => {
    await repository.getContactsByDimension({
      ...old,
      dimension: "language",
      metric: "new",
      ...filter,
    })
    expect(lastQuery().text).toContain('"language" AS dimension')
    expect(lastQuery().text).toContain(FILTER_SQL)
  })
})

describe("message stats — filtered reads", () => {
  const repository = new MessageStatsRepository()

  test("hour: filtered reads the raw table", async () => {
    await repository.getStatsByHour({ ...recent, ...filter })
    expect(lastQuery().text).toContain('FROM "AnalyticsMessageEvent"')
    expect(lastQuery().text).toContain(FILTER_SQL)

    await repository.getStatsByHour(recent)
    expect(lastQuery().text).toContain("analytics_message_events_hourly")
  })

  test("day and minute apply the filter", async () => {
    await repository.getStatsByDay({ ...old, ...filter })
    expect(lastQuery().text).toContain(FILTER_SQL)
    await repository.getStatsByMinute({ ...old, ...filter })
    expect(lastQuery().text).toContain(FILTER_SQL)
  })
})

describe("bot message stats — filtered hour reads", () => {
  const repository = new BotMessageStatsRepository()

  test.each([
    ["getMessagesByResult"],
    ["getMessagesWithNoResponse"],
    ["getMessagesWithResponse"],
  ] as const)("%s buckets the raw table by hour when filtered", async (method) => {
    await repository[method]({ ...recent, granularity: "hour", ...filter })
    expect(lastQuery().text).toContain('FROM "AnalyticsBotMessageEvent"')
    expect(lastQuery().text).toContain("time_bucket('1 hour'")
    expect(lastQuery().text).toContain(FILTER_SQL)

    await repository[method]({ ...recent, granularity: "hour" })
    expect(lastQuery().text).toContain("analytics_bot_message_events_hourly")
  })
})

describe("conversation stats — filtered reads", () => {
  const repository = new ConversationStatsRepository()

  test("a recent filtered range skips the cagg", async () => {
    await repository.getHandoffsByDay({ ...recent, ...filter })
    expect(lastQuery().text).toContain('FROM "AnalyticsConversationEvent"')
    expect(lastQuery().text).toContain(FILTER_SQL)

    await repository.getHandoffsByDay(recent)
    expect(lastQuery().text).toContain("analytics_conversation_events_hourly")
  })
})

describe("insertEvents — inbox attribution and stable ids", () => {
  const occurredAt = new Date("2026-01-02T00:00:00.000Z")

  beforeEach(() => {
    values.mockClear()
    onConflictDoNothing.mockClear()
  })

  const insertedRow = () =>
    (values.mock.calls.at(-1) as unknown as [Record<string, unknown>[]])[0][0]

  test("message events keep a supplied logical id over the stream id and store the inbox", async () => {
    await new MessageStatsRepository().insertEvents(
      [
        {
          eventId: "msg-1:0",
          "event-bus-message-id": "1700000000-0",
          workspaceId: "ws-1",
          contactId: "c-1",
          occurredAt,
          senderType: "human",
          adminId: "admin-1",
          channel: "messenger",
          inboxId: "7",
        } as never,
      ],
      "message_human_sent",
    )

    expect(insertedRow()).toMatchObject({
      eventId: "msg-1:0",
      inboxId: "7",
      adminId: "admin-1",
    })
    expect(onConflictDoNothing).toHaveBeenCalledTimes(1)
  })

  test("a re-run with the same logical id produces the same primary key", async () => {
    const payload = {
      eventId: "msg-1:0",
      workspaceId: "ws-1",
      contactId: "c-1",
      occurredAt,
    } as never
    const repository = new MessageStatsRepository()
    await repository.insertEvents([payload], "message_human_sent")
    const first = insertedRow()
    await repository.insertEvents([payload], "message_human_sent")
    expect([insertedRow().eventId, insertedRow().occurredAt]).toEqual([
      first.eventId,
      first.occurredAt,
    ])
  })

  test("without a logical id the stream id is still used", async () => {
    await new MessageStatsRepository().insertEvents(
      [
        {
          workspaceId: "ws-1",
          contactId: "c-1",
          occurredAt,
        } as never,
      ],
      "message_bot_sent",
    )
    expect(typeof insertedRow().eventId).toBe("string")
    expect(insertedRow().inboxId).toBeNull()
  })

  test("contact, conversation and bot events store inboxId; contacts also store language", async () => {
    await new ContactStatsRepository().insertEvents(
      [
        {
          workspaceId: "ws-1",
          contactId: "c-1",
          occurredAt,
          channel: "messenger",
          inboxId: "7",
          language: "vi",
        },
      ],
      "contact_created",
    )
    expect(insertedRow()).toMatchObject({ inboxId: "7", language: "vi" })

    await new ConversationStatsRepository().insertEvents(
      [
        {
          workspaceId: "ws-1",
          conversationId: "cv-1",
          occurredAt,
          inboxId: "7",
        },
      ],
      "conversation_archived",
    )
    expect(insertedRow()).toMatchObject({ inboxId: "7" })

    await new BotMessageStatsRepository().insertEvents([
      {
        workspaceId: "ws-1",
        messageId: "m-1",
        conversationId: "cv-1",
        occurredAt,
        hasResponse: true,
        inboxId: "7",
      } as never,
    ])
    expect(insertedRow()).toMatchObject({ inboxId: "7" })
  })
})

describe("contact totals under an inbox filter", () => {
  const repository = new ContactStatsRepository()

  // Answers each query by what it reads: the per-inbox counts, the events since
  // the start (anchored) or before it (balance), or the daily series.
  const answer = (rows: { current: number; net: number }) => {
    execute.mockImplementation((query: unknown) => {
      const { text } = renderSql(query)
      if (text.includes('FROM "InboxContactStat"') && !text.includes("since")) {
        return Promise.resolve({ rows: [{ total: rows.current }] })
      }
      if (text.includes("AS net FROM") && !text.includes("GROUP BY")) {
        return Promise.resolve({ rows: [{ net: rows.net }] })
      }
      return Promise.resolve({ rows: [] })
    })
  }

  test("anchors the running total on the exact per-inbox count, never on the pre-start balance", async () => {
    answer({ current: 10, net: 3 })

    const series = await repository.getContactCountsPerDay({
      ...old,
      inboxIds: ["7"],
    })

    const texts = execute.mock.calls.map(([q]) => renderSql(q).text)
    expect(texts.some((t) => t.includes('"occurredAt" >= date_trunc'))).toBe(
      true,
    )
    expect(texts.some((t) => t.includes('"occurredAt" < date_trunc'))).toBe(
      false,
    )
    expect(texts.some((t) => t.includes('FROM "InboxContactStat"'))).toBe(true)
    // No events inside the range: every point is 10 - 3.
    expect(series.every((point) => point.count === 7)).toBe(true)
  })

  test("a deletion of a contact created before inbox tracking cannot drive the total below zero", async () => {
    // Only the deletion carries the inbox: the event balance would be -1.
    answer({ current: 0, net: -1 })

    const series = await repository.getContactCountsPerDay({
      ...old,
      inboxIds: ["7"],
    })

    expect(series.every((point) => point.count >= 0)).toBe(true)
  })

  test("the monthly path anchors the same way", async () => {
    answer({ current: 5, net: 1 })

    const series = await repository.getContactCountsPerDay({
      ...old,
      from: new Date("2025-01-01T00:00:00.000Z"),
      inboxIds: ["7"],
    })

    expect(series.at(0)?.count).toBe(4)
  })

  test("a channel-only filter keeps the event balance before the start", async () => {
    answer({ current: 99, net: 2 })

    const series = await repository.getContactCountsPerDay({
      ...old,
      channels: ["messenger"],
    })

    const texts = execute.mock.calls.map(([q]) => renderSql(q).text)
    expect(texts.some((t) => t.includes('"occurredAt" < date_trunc'))).toBe(
      true,
    )
    expect(texts.some((t) => t.includes('FROM "InboxContactStat"'))).toBe(false)
    expect(series.every((point) => point.count === 2)).toBe(true)
  })

  test("total by channel under an inbox filter reads per-inbox counts minus the events after `to`", async () => {
    await repository.getContactsByDimension({
      ...old,
      dimension: "channel",
      metric: "total",
      inboxIds: ["7"],
    })

    const { text, params } = lastQuery()
    expect(text).toContain('FROM "InboxContactStat" ics')
    expect(text).toContain('ics."inboxId" IN (?)')
    expect(text).toContain('"occurredAt" > ?')
    expect(text).toContain("current.total - COALESCE(since.net, 0) > 0")
    expect(params).toEqual(expect.arrayContaining(["7", old.to]))
  })

  test("total by channel without an inbox filter keeps the event balance", async () => {
    await repository.getContactsByDimension({
      ...old,
      dimension: "channel",
      metric: "total",
      channels: ["messenger"],
    })

    expect(lastQuery().text).not.toContain("InboxContactStat")
    expect(lastQuery().text).toContain('"occurredAt" <= ?')
  })
})
