import type { GoogleAdsStatBucket } from "@chatbotx.io/business/google-ads/stat-buckets"
import { GOOGLE_ADS_STAT_BUCKETS } from "@chatbotx.io/business/google-ads/stat-buckets"
import { eventStatusTone, type StatusTone } from "./status"

/** Left to right everywhere: tiles, chart stack, table columns. */
export const STAT_BUCKET_ORDER = [
  "confirmed",
  "awaitingGoogle",
  "queued",
  "failed",
  "skipped",
] as const satisfies readonly GoogleAdsStatBucket[]

export const bucketLabelKey = {
  confirmed: "googleAds.stats.tiles.confirmed",
  awaitingGoogle: "googleAds.stats.tiles.awaitingGoogle",
  queued: "googleAds.stats.tiles.queued",
  failed: "googleAds.stats.tiles.failed",
  skipped: "googleAds.stats.tiles.skipped",
} as const satisfies Record<GoogleAdsStatBucket, string>

export const bucketHelpKey = {
  confirmed: "googleAds.stats.tiles.confirmedHelp",
  awaitingGoogle: "googleAds.stats.tiles.awaitingGoogleHelp",
  queued: "googleAds.stats.tiles.queuedHelp",
  failed: "googleAds.stats.tiles.failedHelp",
  skipped: "googleAds.stats.tiles.skippedHelp",
} as const satisfies Record<GoogleAdsStatBucket, string>

/** A bucket reads like the history badge of the status that leads it. */
export const bucketTone = {
  confirmed: eventStatusTone[GOOGLE_ADS_STAT_BUCKETS.confirmed[0]],
  awaitingGoogle: eventStatusTone[GOOGLE_ADS_STAT_BUCKETS.awaitingGoogle[0]],
  queued: eventStatusTone[GOOGLE_ADS_STAT_BUCKETS.queued[0]],
  failed: eventStatusTone[GOOGLE_ADS_STAT_BUCKETS.failed[0]],
  skipped: eventStatusTone[GOOGLE_ADS_STAT_BUCKETS.skipped[0]],
} as const satisfies Record<GoogleAdsStatBucket, StatusTone>

/** Chart series colours: semantic (green done, blue waiting, red failed), never the only signal (legend and table back them). */
export const bucketChartColor = {
  confirmed: "oklch(0.696 0.17 162.48)",
  awaitingGoogle: "oklch(0.685 0.169 237.323)",
  queued: "oklch(0.554 0.046 257.417)",
  failed: "var(--color-destructive)",
  skipped: "oklch(0.705 0.015 286.067)",
} as const satisfies Record<GoogleAdsStatBucket, string>
