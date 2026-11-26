import pLimit from "p-limit"
import { logger } from "../../../lib/logger"
import type { CoexistUsageSignal } from "./pull-adapter"
import { resolveUsageThrottle, sleepForUsageThrottle } from "./usage-throttle"

const DEFAULT_CONCURRENCY = 3
const MAX_USAGE_PAUSE_MS = 45_000

export type InstagramUsageThrottle = {
  /** Feeds a Graph answer's app-usage signal into the concurrency and pause. */
  applyUsageThrottle: (
    usageSignal: CoexistUsageSignal | null | undefined,
  ) => void
  /** Waits out a pause the usage budget asked for. */
  respectUsagePause: () => Promise<void>
  /** The limiter for the current concurrency (it changes as usage does). */
  getLimit: () => ReturnType<typeof pLimit>
}

/**
 * Adaptive Graph pacing for one Instagram run, driven by the app-usage header.
 * Shared by the history sync and the AhaChat import.
 */
export const createInstagramUsageThrottle = (input: {
  runId: string
}): InstagramUsageThrottle => {
  let currentConcurrency = DEFAULT_CONCURRENCY
  let limit = pLimit(currentConcurrency)
  let pauseUntil = 0

  const applyUsageThrottle = (
    usageSignal: CoexistUsageSignal | null | undefined,
  ): void => {
    const decision = resolveUsageThrottle({
      signal: usageSignal,
      defaultConcurrency: DEFAULT_CONCURRENCY,
      maxPauseMs: MAX_USAGE_PAUSE_MS,
    })
    if (decision.pauseMs > 0) {
      pauseUntil = Math.max(pauseUntil, Date.now() + decision.pauseMs)
      logger.warn(
        { runId: input.runId, usageSignal, pauseMs: decision.pauseMs },
        "[coexist] Instagram usage budget exhausted; pausing Graph calls",
      )
    }

    const nextConcurrency = decision.concurrency > 0 ? decision.concurrency : 1
    if (nextConcurrency !== currentConcurrency) {
      currentConcurrency = nextConcurrency
      limit = pLimit(currentConcurrency)
      logger.info(
        { runId: input.runId, usageSignal, concurrency: currentConcurrency },
        "[coexist] Instagram usage throttle adjusted concurrency",
      )
    }
  }

  const respectUsagePause = async (): Promise<void> => {
    const waitMs = pauseUntil - Date.now()
    if (waitMs > 0) {
      await sleepForUsageThrottle(waitMs)
    }
  }

  return { applyUsageThrottle, respectUsagePause, getLimit: () => limit }
}
