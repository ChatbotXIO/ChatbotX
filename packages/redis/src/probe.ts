import { Redis } from "ioredis"
import { keys } from "./keys"

/** The URL the builder's cache client connects to (`REDIS_CACHE_URL`, else `REDIS_URL`). */
export function resolveCacheRedisUrl(): string {
  const env = keys()
  return env.REDIS_CACHE_URL ?? env.REDIS_URL
}

type ProbeOptions = {
  /** Upper bound for connect and for the PING command. */
  timeoutMs: number
  /** Aborting disconnects the probe client and rejects at once. */
  signal: AbortSignal
  /** Defaults to the cache Redis URL. */
  url?: string
}

/**
 * Sends one `PING` on a dedicated, short-lived client to cache Redis.
 *
 * The shared clients keep their own retry policy (BullMQ needs retry-forever);
 * this probe client alone fails fast: no offline queue, no reconnects, no
 * per-request retries, and connect/command deadlines. It is always
 * disconnected, so a timed-out probe never leaves a socket or command behind.
 */
export async function pingRedis({
  timeoutMs,
  signal,
  url = resolveCacheRedisUrl(),
}: ProbeOptions): Promise<void> {
  signal.throwIfAborted()

  const client = new Redis(url, {
    lazyConnect: true,
    connectTimeout: timeoutMs,
    commandTimeout: timeoutMs,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    retryStrategy: () => null,
    reconnectOnError: () => false,
  })
  // Errors surface through the rejected probe; an unlistened 'error' event
  // would otherwise be logged as unhandled by ioredis.
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
        await client.ping()
      })(),
      aborted,
    ])
  } finally {
    if (onAbort) {
      signal.removeEventListener("abort", onAbort)
    }
    // disconnect() closes the socket immediately and rejects anything pending.
    client.disconnect()
  }
}
