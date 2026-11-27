import { useRef } from "react"

/**
 * One idempotency key per distinct client request: resubmitting the same
 * inputs (a retried or double-submitted click) replays the same key, while a
 * different input is a new request the server must not reject as reused.
 * `reset` ends the current request, so the next click is a new one even with
 * the same inputs (after a success).
 */
export const useIdempotencyKey = () => {
  const last = useRef<{ fingerprint: string; key: string } | null>(null)

  const keyFor = (...parts: unknown[]): string => {
    const fingerprint = JSON.stringify(parts)
    if (last.current?.fingerprint !== fingerprint) {
      last.current = { fingerprint, key: crypto.randomUUID() }
    }
    return last.current.key
  }
  const reset = () => {
    last.current = null
  }
  return { keyFor, reset }
}
