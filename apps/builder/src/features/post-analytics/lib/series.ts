export type SeriesPoint = { day: string; gain: number }
export type RawSeries = { key: string; points: SeriesPoint[] }

/** Series kept in a chart; the rest is folded into one `OTHER_SERIES_KEY`. */
export const MAX_CHART_SERIES = 5
export const OTHER_SERIES_KEY = "__other"

const MS_PER_DAY = 86_400_000
const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

const dayToUtc = (day: string): number | null => {
  const match = DAY_PATTERN.exec(day)
  return match
    ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    : null
}

/** Every `YYYY-MM-DD` from `from` to `to`, inclusive; empty for an invalid or inverted range. */
export const enumerateDays = (from: string, to: string): string[] => {
  const start = dayToUtc(from)
  const end = dayToUtc(to)
  if (start === null || end === null || end < start) {
    return []
  }
  const days: string[] = []
  for (let at = start; at <= end; at += MS_PER_DAY) {
    days.push(new Date(at).toISOString().slice(0, 10))
  }
  return days
}

export type MergedSeries = {
  /** Series keys in chart order (largest total first). */
  keys: string[]
  /** One row per day any series has a point for, in order; a series without that day counts 0. */
  rows: Array<{ day: string } & Record<string, number | string>>
  /** Sum of the gains per key, and over all keys. */
  totals: Record<string, number>
  total: number
}

const sumOf = (points: readonly SeriesPoint[]): number =>
  points.reduce((sum, point) => sum + point.gain, 0)

/**
 * Lines the series up on one shared day axis for the chart. The timeseries
 * route returns a point for every day of the range in each series, so the axis
 * is the union of the days the series carry; no series means no rows (the card
 * shows its empty state, not an axis). A series missing a day counts 0; series
 * past `maxSeries` are summed into one "other" series so the chart stays readable.
 */
export const mergeSeries = (
  series: readonly RawSeries[],
  maxSeries: number = MAX_CHART_SERIES,
): MergedSeries => {
  const ranked = series
    .map((entry) => ({ ...entry, total: sumOf(entry.points) }))
    .sort(
      (a, b) =>
        Math.abs(b.total) - Math.abs(a.total) || a.key.localeCompare(b.key),
    )
  const shown =
    ranked.length > maxSeries ? ranked.slice(0, maxSeries - 1) : ranked
  const folded = ranked.length > maxSeries ? ranked.slice(maxSeries - 1) : []

  const gains = new Map<string, Map<string, number>>()
  for (const entry of shown) {
    gains.set(entry.key, new Map(entry.points.map((p) => [p.day, p.gain])))
  }
  if (folded.length > 0) {
    const other = new Map<string, number>()
    for (const entry of folded) {
      for (const point of entry.points) {
        other.set(point.day, (other.get(point.day) ?? 0) + point.gain)
      }
    }
    gains.set(OTHER_SERIES_KEY, other)
  }

  const keys = [...gains.keys()]
  const totals: Record<string, number> = {}
  for (const key of keys) {
    totals[key] = [...(gains.get(key)?.values() ?? [])].reduce(
      (a, b) => a + b,
      0,
    )
  }
  const days = [
    ...new Set(series.flatMap((entry) => entry.points.map((p) => p.day))),
  ].sort()
  const rows = days.map((day) => {
    const row: { day: string } & Record<string, number | string> = { day }
    for (const key of keys) {
      row[key] = gains.get(key)?.get(day) ?? 0
    }
    return row
  })
  return {
    keys,
    rows,
    total: keys.reduce((sum, key) => sum + (totals[key] ?? 0), 0),
    totals,
  }
}
