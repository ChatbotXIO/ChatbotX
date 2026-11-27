/**
 * Meta Graph API surfaces per-business quota usage via the
 * `X-Business-Use-Case-Usage` response header. Parsing it lets the historical
 * sync proactively throttle concurrency before hitting 429 — the universal
 * pattern in mature bot platforms.
 *
 * Header shape (JSON-encoded):
 *   { "<businessId>": [{ call_count, total_cputime, total_time,
 *                        estimated_time_to_regain_access }] }
 */

export type BucUsage = {
  callCount: number
  totalCpuTime: number
  totalTime: number
  estimatedTimeToRegainAccess: number
}

type RawBucEntry = {
  call_count?: number
  total_cputime?: number
  total_time?: number
  estimated_time_to_regain_access?: number
}

const MS_PER_MINUTE = 60_000

/**
 * `estimated_time_to_regain_access` is in MINUTES (Meta: Graph API "Rate
 * Limits"), not seconds. The one place that converts it, so no caller guesses
 * the unit again.
 */
export const estimatedMinutesToMs = (minutes: number): number =>
  minutes * MS_PER_MINUTE

/** Returns the first BUC entry in the header, or `null` if absent/malformed. */
export const parseBucHeader = (header: string | null): BucUsage | null => {
  if (!header) {
    return null
  }
  try {
    const parsed = JSON.parse(header) as Record<string, RawBucEntry[]>
    const firstBucket = Object.values(parsed)[0]
    const entry = firstBucket?.[0]
    if (!entry) {
      return null
    }
    return {
      callCount: entry.call_count ?? 0,
      totalCpuTime: entry.total_cputime ?? 0,
      totalTime: entry.total_time ?? 0,
      estimatedTimeToRegainAccess: entry.estimated_time_to_regain_access ?? 0,
    }
  } catch {
    return null
  }
}

/**
 * The worst of several readings of the same Page's quota (a batch carries one
 * per sub-request, plus the call's own): the highest of each figure, so the
 * caller backs off for the most pressed reading. `null` when none was sent.
 */
export const mergeBucUsage = (
  readings: readonly (BucUsage | null)[],
): BucUsage | null => {
  const present = readings.filter(
    (reading): reading is BucUsage => reading !== null,
  )
  if (present.length === 0) {
    return null
  }
  return {
    callCount: Math.max(...present.map((usage) => usage.callCount)),
    totalCpuTime: Math.max(...present.map((usage) => usage.totalCpuTime)),
    totalTime: Math.max(...present.map((usage) => usage.totalTime)),
    estimatedTimeToRegainAccess: Math.max(
      ...present.map((usage) => usage.estimatedTimeToRegainAccess),
    ),
  }
}

/**
 * Maps BUC usage to a recommended concurrency. Returns 0 when the bucket is
 * exhausted (caller must pause until `estimatedTimeToRegainAccess`).
 */
export const concurrencyForUsage = (usage: BucUsage | null): number => {
  if (!usage) {
    return 5
  }
  if (usage.estimatedTimeToRegainAccess > 0) {
    return 0
  }
  const peak = Math.max(usage.callCount, usage.totalCpuTime, usage.totalTime)
  if (peak < 50) {
    return 5
  }
  if (peak < 75) {
    return 3
  }
  if (peak < 90) {
    return 1
  }
  return 0
}

type RawAppUsage = {
  call_count?: number
  total_cputime?: number
  total_time?: number
}

/**
 * `X-App-Usage`: percentages of the app's rolling-hour budget. The header
 * carries no time, so the peak is all there is to read.
 */
export const parseAppUsageHeader = (
  header: string | null | undefined,
): number | null => {
  if (!header) {
    return null
  }
  try {
    const parsed = JSON.parse(header) as RawAppUsage
    return Math.max(
      parsed.call_count ?? 0,
      parsed.total_cputime ?? 0,
      parsed.total_time ?? 0,
    )
  } catch {
    return null
  }
}

/** The longest `estimated_time_to_regain_access` (minutes) over every bucket and entry, in ms. */
export const maxBucRegainMs = (
  header: string | null | undefined,
): number | null => {
  if (!header) {
    return null
  }
  try {
    const parsed = JSON.parse(header) as Record<string, RawBucEntry[]>
    let maxMinutes = 0
    for (const entries of Object.values(parsed)) {
      for (const entry of entries) {
        maxMinutes = Math.max(
          maxMinutes,
          entry.estimated_time_to_regain_access ?? 0,
        )
      }
    }
    return maxMinutes > 0 ? estimatedMinutesToMs(maxMinutes) : null
  } catch {
    return null
  }
}

/** Usage (percent of the rolling budget) from which a read pauses instead of going on. */
export const READ_USAGE_EXHAUSTED_PERCENT = 90

/** The pause for an exhausted budget that names no time to regain access. */
export const READ_USAGE_EXHAUSTED_PAUSE_MS = 30_000

type UsageHeaders = { get: (name: string) => string | null }

const isExhausted = (percent: number | null | undefined): boolean =>
  typeof percent === "number" &&
  Number.isFinite(percent) &&
  percent >= READ_USAGE_EXHAUSTED_PERCENT

const finiteOrZero = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0

/**
 * The highest usage percentage of `X-Business-Use-Case-Usage` over every
 * bucket and entry. Defensive: anything but an object of arrays of objects
 * reads as no usage, and a non-number figure reads 0.
 */
const maxBucUsagePercent = (header: string | null | undefined): number => {
  if (!header) {
    return 0
  }
  try {
    const parsed: unknown = JSON.parse(header)
    if (typeof parsed !== "object" || parsed === null) {
      return 0
    }
    let peak = 0
    for (const bucket of Object.values(parsed)) {
      if (!Array.isArray(bucket)) {
        continue
      }
      for (const entry of bucket as unknown[]) {
        if (typeof entry !== "object" || entry === null) {
          continue
        }
        const figures = entry as RawBucEntry
        peak = Math.max(
          peak,
          finiteOrZero(figures.call_count),
          finiteOrZero(figures.total_cputime),
          finiteOrZero(figures.total_time),
        )
      }
    }
    return peak
  } catch {
    return 0
  }
}

/**
 * How long the next read should wait, from the quota headers of the answer to
 * this one: the Business Use Case header's longest regain estimate (minutes,
 * converted), else a fixed pause when either usage header reads exhausted.
 * `null` while the budget has room. Callers bound the wait to their own time.
 */
export const usagePauseMs = (
  headers: UsageHeaders | undefined,
): number | null => {
  const bucHeader = headers?.get("x-business-use-case-usage")
  const regainMs = maxBucRegainMs(bucHeader)
  if (regainMs !== null) {
    return regainMs
  }
  const appPercent = parseAppUsageHeader(headers?.get("x-app-usage"))
  if (isExhausted(maxBucUsagePercent(bucHeader)) || isExhausted(appPercent)) {
    return READ_USAGE_EXHAUSTED_PAUSE_MS
  }
  return null
}
