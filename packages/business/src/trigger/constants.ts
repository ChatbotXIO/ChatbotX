export const MAX_TRIGGERS_PER_WORKSPACE = 50

/**
 * Circuit breaker for runaway automation loops (a trigger whose actions
 * eventually re-fire the same trigger for the same contact, directly or via a
 * flow/sequence/webhook): one trigger may run at most this many times per
 * contact per window. Real loops cycle within seconds, so a short window
 * catches them while keeping each Redis counter key alive for only one window,
 * which bounds Redis memory regardless of how many contacts exist.
 */
export const TRIGGER_CONTACT_RUN_LIMIT = 20
export const TRIGGER_CONTACT_RUN_WINDOW_SECONDS = 60

/**
 * The limiter's Redis call sits on the hot path of every trigger run, so it is
 * bounded, and a failure switches the limiter off for a short while (see
 * `tryAcquireContactRun`). The timeout leaves room for event-loop pauses.
 */
export const TRIGGER_CONTACT_RUN_LIMITER_TIMEOUT_MS = 1000
export const TRIGGER_CONTACT_RUN_LIMITER_BACKOFF_MS = 5000
