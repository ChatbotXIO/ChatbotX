import {
  type BucUsage,
  concurrencyForUsage,
} from "@chatbotx.io/integration-messenger/apis/usage"
import pLimit from "p-limit"
import { logger } from "../../../lib/logger"

/** Graph concurrency while the Business Use Case budget has room. */
const DEFAULT_CONCURRENCY = 5

/**
 * Longest in-process pause for an exhausted budget. A longer one would hold the
 * worker slot past the chunk budget.
 */
const MAX_PAUSE_SEC = 300

export type MessengerBucThrottle = {
  /** Feeds the usage header of a Graph answer into the concurrency and pause. */
  applyBucThrottle: (usage: BucUsage | null | undefined) => void
  /** Waits out a pause the budget asked for. */
  respectPause: () => Promise<void>
  /** The limiter for the current concurrency (it changes as usage does). */
  getLimit: () => ReturnType<typeof pLimit>
}

/**
 * Adaptive Graph pacing for one Messenger run, driven by the BUC usage header:
 * concurrency drops as the budget is used and a pause is held when it is
 * exhausted. Shared by the history sync and the AhaChat import.
 */
export const createMessengerBucThrottle = (input: {
  integrationId: string
}): MessengerBucThrottle => {
  let currentConcurrency = DEFAULT_CONCURRENCY
  let currentLimit = pLimit(currentConcurrency)
  let pauseUntil = 0

  const applyBucThrottle = (usage: BucUsage | null | undefined): void => {
    const next = concurrencyForUsage(usage ?? null)
    if (next === 0) {
      const waitSec = Math.min(
        usage?.estimatedTimeToRegainAccess ?? 60,
        MAX_PAUSE_SEC,
      )
      pauseUntil = Math.max(pauseUntil, Date.now() + waitSec * 1000)
      if (currentConcurrency !== 1) {
        currentConcurrency = 1
        currentLimit = pLimit(1)
      }
      logger.warn(
        { waitSec, integrationId: input.integrationId },
        "[coexist] BUC budget exhausted — pausing Graph calls",
      )
      return
    }
    if (next !== currentConcurrency) {
      currentConcurrency = next
      currentLimit = pLimit(next)
      logger.info(
        { next, integrationId: input.integrationId },
        "[coexist] BUC throttle adjusted Messenger concurrency",
      )
    }
  }

  const respectPause = async (): Promise<void> => {
    if (Date.now() < pauseUntil) {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, pauseUntil - Date.now()),
      )
    }
  }

  return { applyBucThrottle, respectPause, getLimit: () => currentLimit }
}
