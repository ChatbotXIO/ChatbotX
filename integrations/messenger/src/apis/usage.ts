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
