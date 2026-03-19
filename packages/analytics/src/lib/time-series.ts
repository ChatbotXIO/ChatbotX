import {
  differenceInDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  endOfMonth,
  startOfMonth,
} from "date-fns"
import type {
  BotMessageStats,
  ContactCountsSchema,
  ContactEventType,
  ContactStats,
  TimeRangeQuery,
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

export function* iterateUtcDays(from: Date, to: Date): Generator<Date> {
  const fromDay = getUtcDayStart(from)
  const toDay = getUtcDayStart(to)

  for (
    let d = new Date(fromDay);
    d <= toDay;
    d = new Date(d.getTime() + 24 * 60 * 60 * 1000)
  ) {
    yield d
  }
}

export function fillDailyContactStats(
  props: TimeRangeQuery & {
    rows: ContactStats[]
    eventTypes: ContactEventType[]
  },
): ContactStats[] {
  const { chatbotId, from, to, rows, eventTypes } = props
  const keyOf = (day: string, eventType: string) => `${day}::${eventType}`

  const byKey = new Map<string, ContactStats>()
  for (const r of rows) {
    byKey.set(keyOf(getUtcDayKey(r.timestamp), r.eventType), r)
  }

  const filled: ContactStats[] = []
  const daySeries = generateDaySeries(from, to)
  for (const d of daySeries) {
    const dayKey = getUtcDayKey(d)
    for (const et of eventTypes) {
      const existing = byKey.get(keyOf(dayKey, et))
      filled.push(
        existing ?? {
          chatbotId,
          timestamp: getUtcDayStart(d),
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
  const { from, to, raw, initialTotal = 0 } = props

  const byDay = new Map<string, number>()
  for (const r of raw) {
    byDay.set(getUtcDayKey(r.date), r.count)
  }

  const filled: ContactCountsSchema[] = []
  const dateSeries = eachDayOfInterval({ start: from, end: to })
  let lastTotal = initialTotal
  for (const d of dateSeries) {
    const dayKey = getUtcDayKey(d)
    const v = byDay.get(dayKey)
    if (typeof v === "number") {
      lastTotal = v
    }
    filled.push({
      date: getUtcDayStart(d),
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
  const { rows, eventTypes } = props
  const keyOf = (month: string, eventType: string) => `${month}::${eventType}`

  const byKey = new Map<string, ContactStats>()
  for (const r of rows) {
    byKey.set(keyOf(getUtcMonthKey(r.timestamp), r.eventType), r)
  }

  const filled: ContactStats[] = []
  const monthSeries = generateMonthSeries(props.from, props.to)
  for (const m of monthSeries) {
    const monthKey = getUtcMonthKey(m)
    for (const et of eventTypes) {
      const existing = byKey.get(keyOf(monthKey, et))
      filled.push(
        existing ?? {
          chatbotId: props.chatbotId,
          timestamp: getUtcMonthStart(m),
          eventType: et,
          count: 0,
          uniqueContacts: 0,
        },
      )
    }
  }

  return filled
}

export function fillTotalContactsMonthlySeries(
  props: TimeRangeQuery & {
    raw: ContactCountsSchema[]
    initialTotal: number
  },
): ContactCountsSchema[] {
  const { from, to, raw, initialTotal = 0 } = props
  const byMonth = new Map<string, number>()
  for (const r of raw) {
    byMonth.set(getUtcMonthKey(r.date), r.count)
  }

  const filled: ContactCountsSchema[] = []
  let lastTotal = initialTotal

  const monthSeries = generateMonthSeries(from, to)
  for (const m of monthSeries) {
    const monthKey = getUtcMonthKey(m)
    const v = byMonth.get(monthKey)
    if (typeof v === "number") {
      lastTotal = v
    }
    filled.push({
      date: getUtcMonthStart(m),
      count: lastTotal,
    })
  }

  return filled
}

export function fillBotMessageStatsDaySeries(
  props: TimeRangeQuery & {
    rows: BotMessageStats[]
    results: Array<"SUCCESS" | "FALLBACK">
  },
): BotMessageStats[] {
  const { chatbotId, from, to, rows, results } = props
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
          chatbotId,
          timestamp: getUtcDayStart(d),
          hasResponse: true,
          responseType: "NONE",
          result,
          aiProvider: "NONE",
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
    results: Array<"SUCCESS" | "FALLBACK">
  },
): BotMessageStats[] {
  const { chatbotId, from, to, rows, results } = props
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
          chatbotId,
          timestamp: getUtcMonthStart(m),
          hasResponse: true,
          responseType: "NONE",
          result,
          aiProvider: "NONE",
          count: 0,
        },
      )
    }
  }

  return filled
}
