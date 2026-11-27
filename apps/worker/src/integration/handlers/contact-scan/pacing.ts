import type { ContactScanUsageSignal } from "./adapter"

const MS_PER_MINUTE = 60_000

/**
 * Scan rhythm. Thresholds follow v1 and Airbyte's Facebook connector
 * (`source-facebook-marketing`: 85% waits 2 minutes, 95% waits 10 minutes).
 * Plain constants: changing them is a code change and a deploy.
 */
export const CONTACT_SCAN_PACING = {
  /** A chunk ends after this many pages... */
  chunkMaxPages: 5,
  /** ...or after this much wall time, whichever comes first. */
  chunkBudgetMs: 4 * MS_PER_MINUTE,
  /** Pause between two pages of the same chunk. */
  pageGapMs: 1000,
  /** Delay before the next chunk when nothing asks for a longer wait. */
  chunkGapMs: 5000,
  /** Longest wait a provider's own estimate may ask for. */
  maxProviderWaitMs: 30 * MS_PER_MINUTE,
  /** Wait once usage or a rate limit says "stop calling". */
  exhaustedWaitMs: 10 * MS_PER_MINUTE,
  /** Wait once usage is high but the provider has not refused anything. */
  highUsageWaitMs: 2 * MS_PER_MINUTE,
  exhaustedUsagePercent: 95,
  highUsagePercent: 85,
} as const

/**
 * How long the scan must wait before its next provider call, `0` to carry on.
 * The provider's own estimate wins (capped); a refusal or a nearly exhausted
 * quota means "stop calling" because calling on extends a lockout.
 */
export const resolveScanPacing = (input: {
  signal?: ContactScanUsageSignal | null
  rateLimited?: boolean
}): number => {
  const { signal, rateLimited = false } = input
  const retryAfterMs = signal?.retryAfterMs ?? 0
  if (retryAfterMs > 0) {
    return Math.min(retryAfterMs, CONTACT_SCAN_PACING.maxProviderWaitMs)
  }

  const usagePercent = signal?.usagePercent ?? 0
  if (
    rateLimited ||
    usagePercent >= CONTACT_SCAN_PACING.exhaustedUsagePercent
  ) {
    return CONTACT_SCAN_PACING.exhaustedWaitMs
  }
  if (usagePercent >= CONTACT_SCAN_PACING.highUsagePercent) {
    return CONTACT_SCAN_PACING.highUsageWaitMs
  }
  return 0
}
