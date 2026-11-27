import { env } from "../../env"
import { logger } from "../../lib/logger"

export const STATUS_HEARTBEAT_TIMEOUT_MS = 5000

/**
 * Pings the external status-page heartbeat monitor. Running as a schedule
 * queue job (not a process timer) means the ping proves the schedule queue can
 * execute a job: if Redis or the schedule consumer stops, the heartbeat stops.
 *
 * Never throws: the next run is one minute away, so a retry adds nothing. The
 * URL embeds the monitor's secret token and is never logged.
 */
export async function sendStatusHeartbeat(): Promise<void> {
  const url = env.STATUS_HEARTBEAT_WORKER_URL
  // A job already queued when the scheduler was removed still runs once.
  if (!url) {
    return
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(STATUS_HEARTBEAT_TIMEOUT_MS),
    })
    // fetch resolves on HTTP errors; drain the body so the socket is reused.
    await response.body?.cancel()
    if (!response.ok) {
      logger.error(
        { err: new Error(`HTTP ${response.status}`), status: response.status },
        "Status heartbeat was rejected",
      )
    }
  } catch (err) {
    logger.error(
      { err: redactUrl(err, url) },
      "Status heartbeat request failed",
    )
  }
}

/**
 * Rebuilds the error without the URL: undici's `fetch failed` keeps the real
 * reason (ECONNREFUSED, timeout) in `cause`, and some messages quote the URL.
 */
function redactUrl(err: unknown, url: string): Error {
  const describe = (value: unknown): string =>
    (value instanceof Error ? value.message : String(value))
      .split(url)
      .join("<redacted>")
  const cause = err instanceof Error ? err.cause : undefined
  const message = cause ? `${describe(err)}: ${describe(cause)}` : describe(err)
  const redacted = new Error(message)
  redacted.name = err instanceof Error ? err.name : "Error"
  return redacted
}
