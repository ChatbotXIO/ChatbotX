import type { GoogleAdsEventStatus } from "@chatbotx.io/database/partials"

// Client-safe on purpose (a type import and pure functions only): "use client"
// builder code imports this subpath, and the business barrel pulls in the DB client.

/** Raw event status counts, one key per status, as the stats API returns them. */
export type GoogleAdsStatusCounts = Record<GoogleAdsEventStatus, number>

/** How the UI groups the raw statuses. The API never returns these (it stays on raw statuses). */
export const GOOGLE_ADS_STAT_BUCKETS = {
  confirmed: ["processed"],
  awaitingGoogle: ["sent"],
  queued: ["pending", "sending"],
  failed: ["failed"],
  skipped: ["skipped_no_account", "skipped_expired"],
} as const satisfies Record<string, readonly GoogleAdsEventStatus[]>

export type GoogleAdsStatBucket = keyof typeof GOOGLE_ADS_STAT_BUCKETS

type BucketedStatus =
  (typeof GOOGLE_ADS_STAT_BUCKETS)[GoogleAdsStatBucket][number]

// A new event status that no bucket lists makes `never` the declared type, so
// `= true` stops compiling: a status can never silently vanish from the totals.
export const EVERY_STATUS_IS_BUCKETED: [
  Exclude<GoogleAdsEventStatus, BucketedStatus>,
] extends [never]
  ? true
  : never = true

const sumStatuses = (
  counts: GoogleAdsStatusCounts,
  statuses: readonly GoogleAdsEventStatus[],
): number => statuses.reduce((total, status) => total + counts[status], 0)

export const toStatBuckets = (
  counts: GoogleAdsStatusCounts,
): Record<GoogleAdsStatBucket, number> => ({
  confirmed: sumStatuses(counts, GOOGLE_ADS_STAT_BUCKETS.confirmed),
  awaitingGoogle: sumStatuses(counts, GOOGLE_ADS_STAT_BUCKETS.awaitingGoogle),
  queued: sumStatuses(counts, GOOGLE_ADS_STAT_BUCKETS.queued),
  failed: sumStatuses(counts, GOOGLE_ADS_STAT_BUCKETS.failed),
  skipped: sumStatuses(counts, GOOGLE_ADS_STAT_BUCKETS.skipped),
})
