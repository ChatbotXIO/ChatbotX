const MS_PER_HOUR = 60 * 60 * 1000
const MS_PER_DAY = 24 * MS_PER_HOUR

/** Google rejects a click younger than this (`PROCESSING_ERROR_REASON_TOO_RECENT_CLICK`). */
export const MIN_CLICK_AGE_MS = 6 * MS_PER_HOUR
/** Google keeps click ids for 90 days. */
export const MAX_CLICK_AGE_DAYS = 90
/** Delay before a deferred delivery runs again (re-authorization pending). */
export const REDRIVE_DELAY_MS = MS_PER_HOUR
/** Delay before a conversion Google failed transiently while processing is sent again (plan §8). */
export const PROCESSING_REDRIVE_DELAY_MS = 6 * MS_PER_HOUR
/** Redrive generations an event may go through before it is failed (30 deferrals: ~30 h when hourly, longer with the 6 h ones). */
export const MAX_REDRIVE_GENERATIONS = 30
/** Data Manager processes asynchronously; the first status poll waits this long. */
export const FIRST_PROCESSING_CHECK_MS = 3 * MS_PER_HOUR
/** A request still unresolved this long after being sent is failed as timed out. */
export const PROCESSING_TIMEOUT_MS = 7 * MS_PER_DAY
/** A pending event past this age with no live job is considered stranded. */
export const STRANDED_PENDING_AFTER_MS = 10 * 60 * 1000
/** A lease older than this belongs to a crashed worker. */
export const STALE_CLAIM_AFTER_MS = 15 * 60 * 1000

const PROCESSING_BACKOFF_MS = [
  3 * MS_PER_HOUR,
  6 * MS_PER_HOUR,
  12 * MS_PER_HOUR,
  24 * MS_PER_HOUR,
] as const

/** Delay before the first send: the click must be at least {@link MIN_CLICK_AGE_MS} old. */
export const computeSendDelayMs = (receivedAt: Date, now: Date): number =>
  Math.max(0, receivedAt.getTime() + MIN_CLICK_AGE_MS - now.getTime())

/** Backoff before polling again; `attempts` is how many polls already ran. */
export const nextProcessingBackoffMs = (attempts: number): number =>
  PROCESSING_BACKOFF_MS[
    Math.min(Math.max(attempts, 0), PROCESSING_BACKOFF_MS.length - 1)
  ]

/**
 * Advisory only: Google's processing status stays authoritative, and both
 * rules use `googleClickReceivedAt`, a conservative proxy for the click time.
 *
 * - A: the click is more than 90 days old at delivery (`now`).
 * - B: the conversion is later than the action's click-through lookback
 *   (null: 90 days) after the click.
 *
 * The lookback bounds click -> conversion only; delivery - receipt is bounded
 * by 90 days alone, and there is no rule on the conversion's own age. A
 * conversion that precedes the receipt is not expired locally.
 */
export const isConversionExpired = (input: {
  occurredAt: Date
  googleClickReceivedAt: Date
  lookbackWindowDays: number | null
  now: Date
}): boolean => {
  const receivedAtMs = input.googleClickReceivedAt.getTime()
  const clickAgeAtDeliveryMs = input.now.getTime() - receivedAtMs
  const clickToConversionMs = input.occurredAt.getTime() - receivedAtMs
  const lookbackMs =
    (input.lookbackWindowDays ?? MAX_CLICK_AGE_DAYS) * MS_PER_DAY
  return (
    clickAgeAtDeliveryMs > MAX_CLICK_AGE_DAYS * MS_PER_DAY ||
    clickToConversionMs > lookbackMs
  )
}
