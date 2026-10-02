/** Sweeper retry ceiling (`pickDue` / `markMaxAttemptsFailed`). */
export const AI_HANDOVER_BULK_MAX_ATTEMPTS = 5

/**
 * Wall-clock budget of one chunk job. Far below the integration queue's lock
 * duration (>= 10 minutes), so a slow channel call near the end of the budget
 * still finishes inside the lock.
 */
export const AI_HANDOVER_BULK_CHUNK_BUDGET_MS = 45_000

/** Longest pause honoured for a quota wait; the channel's own estimate is capped to this. */
export const AI_HANDOVER_BULK_MAX_PAUSE_MS = 6 * 60 * 60 * 1000

/** Bounded concurrency of the per-contact settlement inside one batch. */
export const AI_HANDOVER_BULK_SETTLE_CONCURRENCY = 10

/**
 * Codes a caller maps to its own localized message (`ChatbotXException.code`).
 * One lookup table so the builder's `aiHandover.bulk.errors.<code>` keys and
 * the service cannot drift.
 */
export const AI_HANDOVER_BULK_ERROR_CODES = {
  /** An ON needs the Page's automation to be running now. */
  automationNotActive: "aiHandoverBulkAutomationNotActive",
  /** An OFF needs the message sent to the customers it takes back. */
  messageRequired: "aiHandoverBulkMessageRequired",
  messageTooLong: "aiHandoverBulkMessageTooLong",
  /** The Page is disconnected: there is nothing to apply to. */
  pageNotConnected: "aiHandoverBulkPageNotConnected",
  /** Retry was asked while the latest revision is running or already succeeded. */
  nothingToRetry: "aiHandoverBulkNothingToRetry",
} as const

/** `currentError` sentinels a run can end with, localized by the builder. */
export const AI_HANDOVER_BULK_RUN_ERRORS = {
  automationStopped: "automationStopped",
  tokenInvalid: "tokenInvalid",
  channelUnsupported: "channelUnsupported",
  /** The channel could not be reached for several batches in a row. */
  channelUnavailable: "channelUnavailable",
  /** The Page was disconnected or deleted while the run was going. */
  pageDisconnected: "pageDisconnected",
  /** The Page refuses the hand-over: not onboarded to the AI, or no permission. */
  pageRefused: "pageRefused",
  /** The Page's integration (token, auth) could not be loaded. */
  integrationUnavailable: "integrationUnavailable",
  /** Some batches could not be confirmed and were counted failed. */
  batchFailed: "batchFailed",
} as const
