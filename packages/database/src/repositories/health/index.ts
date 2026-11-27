import { Client } from "pg"
import { keys } from "../../keys"

type ProbeOptions = {
  /** Upper bound for connect + query; also sent as the server statement timeout. */
  timeoutMs: number
  /** Aborting destroys the probe connection and rejects at once. */
  signal: AbortSignal
}

const PROBE_APPLICATION_NAME = "chatbotx-readiness-probe"

/**
 * Runs `SELECT 1` on a dedicated, short-lived connection to the main database.
 *
 * It never uses the shared pool: a pool wait cannot be cancelled, and a
 * readiness probe must not compete with application queries for a slot. The
 * driver deadlines (connect, query, server statement timeout) bound the work
 * on their own; aborting `signal` additionally destroys the socket so nothing
 * is left pending after the caller's deadline.
 */
export async function pingDatabase({
  timeoutMs,
  signal,
}: ProbeOptions): Promise<void> {
  signal.throwIfAborted()

  const client = new Client({
    connectionString: keys().DATABASE_URL,
    application_name: PROBE_APPLICATION_NAME,
    connectionTimeoutMillis: timeoutMs,
    query_timeout: timeoutMs,
    statement_timeout: timeoutMs,
  })
  // A socket error after the race settles must not become an unhandled
  // 'error' event; the failure already surfaced through the rejected probe.
  client.on("error", () => undefined)

  let onAbort: (() => void) | undefined
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason)
    signal.addEventListener("abort", onAbort, { once: true })
  })

  try {
    await Promise.race([
      (async () => {
        await client.connect()
        await client.query("SELECT 1")
      })(),
      aborted,
    ])
  } finally {
    if (onAbort) {
      signal.removeEventListener("abort", onAbort)
    }
    // end() destroys the socket when a connect or query is still in flight,
    // so a timed-out probe never leaves a connection behind. Not awaited: the
    // close event must not hold the caller past its deadline.
    client.end().catch(() => undefined)
  }
}
