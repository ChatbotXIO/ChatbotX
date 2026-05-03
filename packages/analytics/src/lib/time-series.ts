import {
  differenceInDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfMonth,
  parseISO,
  startOfMonth,
} from "date-fns"
import { formatInTimeZone } from "date-fns-tz"
import {
  type BotMessageResult,
  type BotMessageStats,
  type ContactCountsSchema,
  type ContactEventType,
  type ContactStats,
  type TimeRangeQuery,
  trackingResponseTypes,
} from "../schemas"

export function getUtcMonthKey(date: Date): string {
  return date.toISOString().slice(0, 7)
}

export function getUtcMonthStart(date: Date): Date {
  return new Date(`${getUtcMonthKey(date)}-01T00:00:00.000Z`)
}

export function generateMonthSeries(from: Date, to: Date) {
  const fromMonth = startOfMonth(from)
  const toMonth = endOfMonth(to)

  return eachMonthOfInterval({ start: fromMonth, end: toMonth })
}

export function generateDaySeries(from: Date, to: Date) {
  const fromDay = getUtcDayStart(from)
  const toDay = getUtcDayStart(to)

  return eachDayOfInterval({ start: fromDay, end: toDay })
}

export function shouldUseMonthlyGranularity(props: TimeRangeQuery): boolean {
  return differenceInDays(props.to, props.from) > 60
}

export function getUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function getUtcDayStart(date: Date): Date {
  return new Date(`${getUtcDayKey(date)}T00:00:00.000Z`)
}

export function getTzDayKey(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd")
}

export function getTzMonthKey(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "yyyy-MM")
}

export function* iterateTzDays(
  from: Date,
  to: Date,
  timezone: string,
): Generator<{ key: string; date: Date }> {
  const startKey = getTzDayKey(from, timezone)
  const endKey = getTzDayKey(to, timezone)
  if (startKey > endKey) {
    return
  }

  for (const date of eachDayOfInterval({
    start: parseISO(startKey),
    end: parseISO(endKey),
  })) {
    yield { key: getUtcDayKey(date), date }
  }
}

export function* iterateTzMonths(
  from: Date,
  to: Date,
  timezone: string,
): Generator<{ key: string; date: Date }> {
  const startKey = getTzMonthKey(from, timezone)
  const endKey = getTzMonthKey(to, timezone)
  if (startKey > endKey) {
    return
  }
  for (const date of eachMonthOfInterval({
    start: parseISO(`${startKey}-01`),
    end: parseISO(`${endKey}-01`),
  })) {
    yield { key: getUtcMonthKey(date), date }
  }
}

export function fillDailyContactStats(
  props: TimeRangeQuery & {
    rows: ContactStats[]
    eventTypes: ContactEventType[]
  },
): ContactStats[] {
  const { workspaceId, from, to, timezone, rows, eventTypes } = props
  const keyOf = (day: string, eventType: string) => `${day}::${eventType}`

  const byKey = new Map<string, ContactStats>()
  for (const r of rows) {
    byKey.set(keyOf(getUtcDayKey(r.timestamp), r.eventType), r)
  }

  const filled: ContactStats[] = []
  for (const { key, date } of iterateTzDays(from, to, timezone)) {
    for (const et of eventTypes) {
      const existing = byKey.get(keyOf(key, et))
      filled.push(
        existing ?? {
          workspaceId,
          timestamp: date,
          eventType: et,
          count: 0,
          uniqueContacts: 0,
        },
      )
    }
  }

  return filled
}

export function fillDailyTotalContactsSeries(
  props: TimeRangeQuery & {
    raw: ContactCountsSchema[]
    initialTotal: number
  },
): ContactCountsSchema[] {
  const { from, to, timezone, raw, initialTotal = 0 } = props

  const byDay = new Map<string, number>()
  for (const r of raw) {
    byDay.set(getUtcDayKey(r.date), r.count)
  }

  const filled: ContactCountsSchema[] = []
  let lastTotal = initialTotal
  for (const { key, date } of iterateTzDays(from, to, timezone)) {
    const v = byDay.get(key)
    if (typeof v === "number") {
      lastTotal = v
    }
    filled.push({
      date,
      count: lastTotal,
    })
  }

  return filled
}

export function fillContactStatsMonthlySeries(
  props: TimeRangeQuery & {
    rows: ContactStats[]
    eventTypes: ContactEventType[]
  },
): ContactStats[] {
  const { from, to, timezone, rows, eventTypes } = props
  const keyOf = (month: string, eventType: string) => `${month}::${eventType}`

  const byKey = new Map<string, ContactStats>()
  for (const r of rows) {
    byKey.set(keyOf(getUtcMonthKey(r.timestamp), r.eventType), r)
  }

  const filled: ContactStats[] = []
  for (const { key, date } of iterateTzMonths(from, to, timezone)) {
    for (const et of eventTypes) {
      const existing = byKey.get(keyOf(key, et))
      filled.push(
        existing ?? {
          workspaceId: props.workspaceId,
          timestamp: date,
          eventType: et,
          count: 0,
          uniqueContacts: 0,
        },
      )
    }
  }

  return filled
}

export function fillDailyNewContactsSeries(
  props: TimeRangeQuery & {
    raw: ContactCountsSchema[]
  },
): ContactCountsSchema[] {
  const { from, to, timezone, raw } = props

  const byDay = new Map<string, number>()
  for (const r of raw) {
    byDay.set(getUtcDayKey(r.date), r.count)
  }

  const filled: ContactCountsSchema[] = []
  for (const { key, date } of iterateTzDays(from, to, timezone)) {
    filled.push({
      date,
      count: byDay.get(key) ?? 0,
    })
  }

  return filled
}

export function fillMonthlyNewContactsSeries(
  props: TimeRangeQuery & {
    raw: ContactCountsSchema[]
  },
): ContactCountsSchema[] {
  const { from, to, timezone, raw } = props

  const byMonth = new Map<string, number>()
  for (const r of raw) {
    byMonth.set(getUtcMonthKey(r.date), r.count)
  }

  const filled: ContactCountsSchema[] = []
  for (const { key, date } of iterateTzMonths(from, to, timezone)) {
    filled.push({
      date,
      count: byMonth.get(key) ?? 0,
    })
  }

  return filled
}

export function fillTotalContactsMonthlySeries(
  props: TimeRangeQuery & {
    raw: ContactCountsSchema[]
    initialTotal: number
  },
): ContactCountsSchema[] {
  const { from, to, timezone, raw, initialTotal = 0 } = props
  const byMonth = new Map<string, number>()
  for (const r of raw) {
    byMonth.set(getUtcMonthKey(r.date), r.count)
  }

  const filled: ContactCountsSchema[] = []
  let lastTotal = initialTotal

  for (const { key, date } of iterateTzMonths(from, to, timezone)) {
    const v = byMonth.get(key)
    if (typeof v === "number") {
      lastTotal = v
    }
    filled.push({
      date,
      count: lastTotal,
    })
  }

  return filled
}

export function fillBotMessageStatsDaySeries(
  props: TimeRangeQuery & {
    rows: BotMessageStats[]
    results: BotMessageResult[]
  },
): BotMessageStats[] {
  const { workspaceId, from, to, rows, results } = props
  const keyOf = (day: string, result: string) => `${day}::${result}`

  const byKey = new Map<string, BotMessageStats>()
  for (const r of rows) {
    if (r.result) {
      const key = keyOf(getUtcDayKey(r.timestamp), r.result)
      const existing = byKey.get(key)
      if (existing) {
        existing.count += r.count
      } else {
        byKey.set(key, { ...r })
      }
    }
  }

  const filled: BotMessageStats[] = []
  const daySeries = generateDaySeries(from, to)
  for (const d of daySeries) {
    const dayKey = getUtcDayKey(d)
    for (const result of results) {
      const existing = byKey.get(keyOf(dayKey, result))
      filled.push(
        existing ?? {
          workspaceId,
          timestamp: getUtcDayStart(d),
          hasResponse: true,
          responseType: trackingResponseTypes.enum.none,
          result,
          aiProvider: "none",
          count: 0,
        },
      )
    }
  }

  return filled
}

export function fillBotMessageStatsMonthSeries(
  props: TimeRangeQuery & {
    rows: BotMessageStats[]
    results: BotMessageResult[]
  },
): BotMessageStats[] {
  const { workspaceId, from, to, rows, results } = props
  const keyOf = (month: string, result: string) => `${month}::${result}`

  const byKey = new Map<string, BotMessageStats>()
  for (const r of rows) {
    if (r.result) {
      const key = keyOf(getUtcMonthKey(r.timestamp), r.result)
      const existing = byKey.get(key)
      if (existing) {
        existing.count += r.count
      } else {
        byKey.set(key, { ...r })
      }
    }
  }

  const filled: BotMessageStats[] = []
  const monthSeries = generateMonthSeries(from, to)
  for (const m of monthSeries) {
    const monthKey = getUtcMonthKey(m)
    for (const result of results) {
      const existing = byKey.get(keyOf(monthKey, result))
      filled.push(
        existing ?? {
          workspaceId,
          timestamp: getUtcMonthStart(m),
          hasResponse: true,
          responseType: "none",
          result,
          aiProvider: "none",
          count: 0,
        },
      )
    }
  }

  return filled
}
