/**
 * Client-safe result vocabulary of `threadControlAction` (no server imports:
 * the inbox hook reads it in the browser).
 *
 * The expected refusal of a `take` — the channel reports the caller may not
 * take the thread (WhatsApp `2494191`: only the escalation partner can) — is
 * returned, not thrown, so the composer renders it inline and keeps the lock
 * instead of a transient toast.
 */
export const THREAD_CONTROL_NOT_ESCALATION = "notEscalation"

export type ThreadControlRefusal = {
  status: typeof THREAD_CONTROL_NOT_ESCALATION
}
