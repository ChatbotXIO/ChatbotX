import { describe, expect, test } from "vitest"
import {
  fillDailyMessageStats,
  fillMessageStatsMonthlySeries,
} from "../src/lib/time-series"
import type { MessageStats } from "../src/schemas/message-event"

const BASE_QUERY = {
  workspaceId: "ws-1",
  timezone: "UTC",
}

function makeMessageStat(
  isoDate: string,
  eventType: "message_human_sent" | "message_bot_sent",
  count: number,
): MessageStats {
  return {
    workspaceId: "ws-1",
    timestamp: new Date(isoDate),
    eventType,
    count,
    uniqueContacts: 0,
  }
}

describe("fillDailyMessageStats", () => {
  test("fills missing days with zero rows for each event type", () => {
    const from = new Date("2026-05-01T00:00:00.000Z")
    const to = new Date("2026-05-03T00:00:00.000Z")
    const eventTypes = ["message_human_sent", "message_bot_sent"] as const

    const rows: MessageStats[] = [
      makeMessageStat("2026-05-01T00:00:00.000Z", "message_human_sent", 5),
    ]

    const result = fillDailyMessageStats({
      ...BASE_QUERY,
      from,
      to,
      rows,
      eventTypes: [...eventTypes],
    })

    // 3 days × 2 event types = 6 entries
    expect(result).toHaveLength(6)

    const may1Human = result.find(
      (r) =>
        r.timestamp.toISOString().startsWith("2026-05-01") &&
        r.eventType === "message_human_sent",
    )
    expect(may1Human?.count).toBe(5)

    const filledEntries = result.filter((r) => r.count === 0)
    expect(filledEntries).toHaveLength(5)
  })

  test("returns only zeros when rows array is empty", () => {
    const from = new Date("2026-05-01T00:00:00.000Z")
    const to = new Date("2026-05-02T00:00:00.000Z")

    const result = fillDailyMessageStats({
      ...BASE_QUERY,
      from,
      to,
      rows: [],
      eventTypes: ["message_human_sent"],
    })

    expect(result).toHaveLength(2)
    for (const r of result) {
      expect(r.count).toBe(0)
    }
  })

  test("preserves existing rows and fills gaps", () => {
    const from = new Date("2026-05-01T00:00:00.000Z")
    const to = new Date("2026-05-03T00:00:00.000Z")

    const rows: MessageStats[] = [
      makeMessageStat("2026-05-02T00:00:00.000Z", "message_bot_sent", 10),
    ]

    const result = fillDailyMessageStats({
      ...BASE_QUERY,
      from,
      to,
      rows,
      eventTypes: ["message_bot_sent"],
    })

    expect(result).toHaveLength(3)
    const may2 = result.find((r) =>
      r.timestamp.toISOString().startsWith("2026-05-02"),
    )
    expect(may2?.count).toBe(10)

    const zeros = result.filter((r) => r.count === 0)
    expect(zeros).toHaveLength(2)
  })

  test("returns empty array when from is after to", () => {
    const result = fillDailyMessageStats({
      ...BASE_QUERY,
      from: new Date("2026-05-10T00:00:00.000Z"),
      to: new Date("2026-05-01T00:00:00.000Z"),
      rows: [],
      eventTypes: ["message_human_sent"],
    })

    expect(result).toHaveLength(0)
  })
})

describe("fillMessageStatsMonthlySeries", () => {
  test("fills missing months with zero rows for each event type", () => {
    const from = new Date("2026-01-01T00:00:00.000Z")
    const to = new Date("2026-03-31T00:00:00.000Z")
    const eventTypes = ["message_human_sent", "message_bot_sent"] as const

    const rows: MessageStats[] = [
      makeMessageStat("2026-02-01T00:00:00.000Z", "message_human_sent", 42),
    ]

    const result = fillMessageStatsMonthlySeries({
      ...BASE_QUERY,
      from,
      to,
      rows,
      eventTypes: [...eventTypes],
    })

    // 3 months × 2 event types = 6 entries
    expect(result).toHaveLength(6)

    const febHuman = result.find(
      (r) =>
        r.timestamp.toISOString().startsWith("2026-02") &&
        r.eventType === "message_human_sent",
    )
    expect(febHuman?.count).toBe(42)

    const zeros = result.filter((r) => r.count === 0)
    expect(zeros).toHaveLength(5)
  })

  test("returns empty array when from month is after to month", () => {
    const result = fillMessageStatsMonthlySeries({
      ...BASE_QUERY,
      from: new Date("2026-06-01T00:00:00.000Z"),
      to: new Date("2026-01-31T00:00:00.000Z"),
      rows: [],
      eventTypes: ["message_bot_sent"],
    })

    expect(result).toHaveLength(0)
  })

  test("fills zero when rows is empty", () => {
    const from = new Date("2026-01-01T00:00:00.000Z")
    const to = new Date("2026-01-31T00:00:00.000Z")

    const result = fillMessageStatsMonthlySeries({
      ...BASE_QUERY,
      from,
      to,
      rows: [],
      eventTypes: ["message_human_sent", "message_bot_sent"],
    })

    expect(result).toHaveLength(2)
    for (const r of result) {
      expect(r.count).toBe(0)
    }
  })
})
