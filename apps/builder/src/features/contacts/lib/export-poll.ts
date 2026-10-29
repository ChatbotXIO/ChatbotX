/** How long the export dialog polls before telling the user it is slow. */
export const EXPORT_POLL_TIMEOUT_MS = 2 * 60 * 1000

/** When a query last answered: with data, or with an error. */
type PollTimestamps = { dataUpdatedAt: number; errorUpdatedAt: number }

/**
 * Whether polling an export has run past {@link EXPORT_POLL_TIMEOUT_MS}, by
 * the time of the last poll, failed ones included, so a poll that keeps
 * erroring still times out. Derived from timestamps, not a counter bumped in
 * `refetchInterval`: TanStack re-evaluates that callback on every render, so
 * a counter there races to its limit without a single real poll.
 */
export const isExportPollTimedOut = (
  startedAt: number,
  { dataUpdatedAt, errorUpdatedAt }: PollTimestamps,
): boolean =>
  Math.max(dataUpdatedAt, errorUpdatedAt) - startedAt >= EXPORT_POLL_TIMEOUT_MS
