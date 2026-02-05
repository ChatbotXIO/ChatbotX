import type {
  ContactEventType,
  ContactStats,
  DailyTotalContacts,
  TimeRange,
} from "../models"

export function getUtcMonthKey(date: Date): string {
  return date.toISOString().slice(0, 7)
}

export function getUtcMonthStart(date: Date): Date {
  return new Date(`${getUtcMonthKey(date)}-01T00:00:00.000Z`)
}

export function* iterateUtcMonths(from: Date, to: Date): Generator<Date> {
  const fromMonth = getUtcMonthStart(from)
  const toMonth = getUtcMonthStart(to)

  const current = new Date(fromMonth)
  while (current <= toMonth) {
    yield new Date(current)
    current.setUTCMonth(current.getUTCMonth() + 1)
  }
}

export function shouldUseMonthlyGranularity(from: Date, to: Date): boolean {
  const diffMs = to.getTime() - from.getTime()
  const diffDays = diffMs / (1000 * 60 * 60 * 24)
  return diffDays > 60
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

export function fillContactStatsDaySeries(
  chatbotId: string,
  timeRange: TimeRange,
  rows: ContactStats[],
  eventTypes: ContactEventType[],
): ContactStats[] {
  const keyOf = (day: string, eventType: string) => `${day}::${eventType}`

  const byKey = new Map<string, ContactStats>()
  for (const r of rows) {
    byKey.set(keyOf(getUtcDayKey(r.timestamp), r.eventType), r)
  }

  const filled: ContactStats[] = []
  for (const d of iterateUtcDays(timeRange.from, timeRange.to)) {
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
  timeRange: TimeRange,
  raw: DailyTotalContacts[],
): DailyTotalContacts[] {
  const byDay = new Map<string, number>()
  for (const r of raw) {
    byDay.set(getUtcDayKey(r.day), r.totalContacts)
  }

  const filled: DailyTotalContacts[] = []
  let lastTotal = 0
  for (const d of iterateUtcDays(timeRange.from, timeRange.to)) {
    const dayKey = getUtcDayKey(d)
    const v = byDay.get(dayKey)
    if (typeof v === "number") {
      lastTotal = v
    }
    filled.push({
      day: getUtcDayStart(d),
      totalContacts: lastTotal,
    })
  }

  return filled
}

export function fillContactStatsMonthSeries(
  chatbotId: string,
  timeRange: TimeRange,
  rows: ContactStats[],
  eventTypes: ContactEventType[],
): ContactStats[] {
  const keyOf = (month: string, eventType: string) => `${month}::${eventType}`

  const byKey = new Map<string, ContactStats>()
  for (const r of rows) {
    byKey.set(keyOf(getUtcMonthKey(r.timestamp), r.eventType), r)
  }

  const filled: ContactStats[] = []
  for (const m of iterateUtcMonths(timeRange.from, timeRange.to)) {
    const monthKey = getUtcMonthKey(m)
    for (const et of eventTypes) {
      const existing = byKey.get(keyOf(monthKey, et))
      filled.push(
        existing ?? {
          chatbotId,
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

export function fillMonthlyTotalContactsSeries(
  timeRange: TimeRange,
  raw: DailyTotalContacts[],
): DailyTotalContacts[] {
  const byMonth = new Map<string, number>()
  for (const r of raw) {
    byMonth.set(getUtcMonthKey(r.day), r.totalContacts)
  }

  const filled: DailyTotalContacts[] = []
  let lastTotal = 0
  for (const m of iterateUtcMonths(timeRange.from, timeRange.to)) {
    const monthKey = getUtcMonthKey(m)
    const v = byMonth.get(monthKey)
    if (typeof v === "number") {
      lastTotal = v
    }
    filled.push({
      day: getUtcMonthStart(m),
      totalContacts: lastTotal,
    })
  }

  return filled
}
