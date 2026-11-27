import { pingDatabase } from "@chatbotx.io/database/repositories/health"
import { pingRedis } from "@chatbotx.io/redis/probe"

/** Total budget per dependency, including connection setup. */
export const READINESS_CHECK_TIMEOUT_MS = 2000

export type ReadinessResult = {
  db: boolean
  redis: boolean
}

type Probe = (options: {
  timeoutMs: number
  signal: AbortSignal
}) => Promise<void>

/**
 * Runs `probe` under a hard deadline. On timeout the signal aborts, which makes
 * the probe destroy its dedicated connection; the timer is always cleared.
 * Resolves to `true` on success and `false` on any failure — never rejects.
 */
async function runProbe(probe: Probe, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new Error("Readiness probe timed out"))
  }, timeoutMs)
  try {
    await probe({ timeoutMs, signal: controller.signal })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

async function runReadinessChecks(): Promise<ReadinessResult> {
  const [db, redis] = await Promise.all([
    runProbe(pingDatabase, READINESS_CHECK_TIMEOUT_MS),
    runProbe(pingRedis, READINESS_CHECK_TIMEOUT_MS),
  ])
  return { db, redis }
}

let inFlight: Promise<ReadinessResult> | null = null

/**
 * Checks the main database (`SELECT 1`) and cache Redis (`PING`) in parallel,
 * each on its own short-lived probe connection with a 2-second total budget.
 *
 * Concurrent callers share one in-flight check per process, so a burst of
 * monitor requests opens at most one probe connection per dependency.
 */
export function checkReadiness(): Promise<ReadinessResult> {
  if (!inFlight) {
    inFlight = runReadinessChecks().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}
