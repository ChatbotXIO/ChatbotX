/**
 * How long an operator must wait after a scan was *submitted* before another
 * one can be requested for the same inbox — measured from `createdAt`, not
 * from when the scan finished. Ported from v1's `canScanSub` (24h).
 */
export const CONTACT_SCAN_COOLDOWN_MS = 24 * 60 * 60 * 1000

/**
 * Estimated time to completion shown to the operator, derived (never
 * persisted) as `createdAt + CONTACT_SCAN_ETA_MS`. Ported from v1's
 * `eta_at` (submit + 4h).
 */
export const CONTACT_SCAN_ETA_MS = 4 * 60 * 60 * 1000

/**
 * Scheduler retry ceiling passed to `pickDueRuns`/`markMaxAttemptsFailed`
 * (`type: "contact_scan"`) — mirrors `scanCoexistRuns`'s `MAX_ATTEMPTS`
 * (`apps/worker/src/schedule/handlers/scan-coexist-runs.ts`).
 */
export const CONTACT_SCAN_MAX_ATTEMPTS = 5

/** `CoexistSyncRun.triggerSource` value written by `ContactScanService.schedule`. */
export const CONTACT_SCAN_TRIGGER_SOURCE = "contact-scan-manual"

/**
 * Runaway guard on total pages walked by a single run, accumulated across
 * every chunk continuation (`CoexistSyncRun.currentPageNumber`). Ported from
 * v1's hard lookback cap so an operator-chosen `scanFromAt` far in the past
 * against a huge inbox can't turn into an unbounded number of Graph API
 * pages/DB writes. At the provider's ~499-conversations-per-page ceiling
 * (see `messenger-helpers.ts`/Graph's own page-size limit), 5000 pages is
 * ~2.5M conversations — comfortably above any real workspace's inbox size,
 * so this only ever trips on a pathological/misconfigured scan.
 */
export const CONTACT_SCAN_MAX_PAGES = 5000

/**
 * `currentError` sentinels a scan run can be terminalized/reset with. Kept as
 * a lookup table (not scattered string literals) so the worker engine and the
 * builder's `errors.<code>` i18n keys stay in lockstep with the same values.
 */
export const CONTACT_SCAN_ERRORS = {
  /** The adapter could not load its workspace-scoped integration/inbox context. */
  integrationUnavailable: "integrationUnavailable",
  /** Provider classified the failure as an invalid/expired access token. */
  tokenInvalid: "tokenInvalid",
  /** Provider classified the failure as a missing Graph permission/scope. */
  graphPermission: "graphPermission",
  /** Provider classified the failure as transient — eligible for a scheduler retry. */
  providerRetryable: "providerRetryable",
  /** The scheduler exhausted `CONTACT_SCAN_MAX_ATTEMPTS` without success. */
  maxAttempts: "maxAttempts",
  /** A single conversation page failed to import; the walk continued past it. */
  pageFailed: "pageFailed",
  /**
   * `bulkImportChannelContacts` threw for the current page. Distinct from
   * `pageFailed` (which used to mean "the walk continued past a lost page"):
   * this sentinel means the walk STOPPED and handed the run back to the
   * scheduler via `resetForRetry` so the SAME page is retried from the last
   * persisted `resumeCursor` — no cursor advance, no contacts skipped.
   */
  pageImportFailed: "pageImportFailed",
  /** The claimed run's `channel` is not a `ContactScanChannel`. */
  channelUnsupported: "channelUnsupported",
  /** The walk hit `CONTACT_SCAN_MAX_PAGES` and stopped early as a runaway guard. */
  scanLimitReached: "scanLimitReached",
} as const

export type ContactScanErrorSentinel =
  (typeof CONTACT_SCAN_ERRORS)[keyof typeof CONTACT_SCAN_ERRORS]
