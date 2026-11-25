import type { SocialPublishFailed } from "@chatbotx.io/utils/social-publisher"
import { logger } from "../logger"
import {
  type PublishAuthFailureCategory,
  type PublishCredentials,
  recordPublishAuthFailure,
} from "../publish-destination/credentials"

/** How long one attempt holds a target before the recovery scan may take it over. */
export const SOCIAL_POST_LEASE_MS = 10 * 60 * 1000
export const SOCIAL_POST_RECOVER_BATCH = 25
/**
 * Time one scan or recovery tick may spend claiming batches, below the worker
 * lock's 50 s timeout (the same budget as the feed scan). The rest waits for
 * the next tick.
 */
export const SOCIAL_POST_SCAN_BUDGET_MS = 40 * 1000
/** Shortest wait before a network-side job (a container) is read again. */
export const MIN_POLL_MS = 15 * 1000
/** A container that is not finished this long after its creation is given up (nothing was published). */
export const SOCIAL_POST_PROCESSING_TIMEOUT_MS = 2 * 60 * 60 * 1000

/** An error reduced to what is safe and useful to log. */
export const logSafe = (err: unknown): unknown =>
  err instanceof Error ? { message: err.message, name: err.name } : err

export const failure = (
  category: SocialPublishFailed["category"],
  code: string,
  message: string,
  provablyNotCreated: boolean,
): SocialPublishFailed => ({
  category,
  code,
  message,
  provablyNotCreated,
  status: "failed",
})

export const asStringMap = (
  value: Record<string, string | number | boolean>,
): Record<string, string> =>
  Object.fromEntries(Object.entries(value).map(([k, v]) => [k, String(v)]))

/**
 * Records a rejected token or missing permission after the target's result is
 * stored. A failure here is logged, never thrown: the result is already safe.
 */
export const recordPublishAuthFailureSafely = async (input: {
  category: PublishAuthFailureCategory
  credentials: Pick<PublishCredentials, "fence" | "publisherKey">
  workspaceId: string
}): Promise<void> => {
  try {
    await recordPublishAuthFailure(input)
  } catch (err) {
    logger.error(
      { err: logSafe(err) },
      "social-post publish: recording the auth failure failed",
    )
  }
}

/**
 * Claims batch after batch until one comes back short (nothing is left) or the
 * time budget is spent. A claim moves each row's marker (`leaseExpiresAt`)
 * past `now`, so the next batch reaches new rows, and a row that is only
 * skipped (a blocked owner's) cannot hold the head of the line. Returns how
 * many rows were claimed.
 */
export const claimInBatches = async <Row>(input: {
  batchSize: number
  claim: () => Promise<Row[]>
  handle: (rows: Row[]) => Promise<void>
  budgetMs?: number
}): Promise<number> => {
  const startedAt = Date.now()
  const budgetMs = input.budgetMs ?? SOCIAL_POST_SCAN_BUDGET_MS
  let claimed = 0
  for (;;) {
    const rows = await input.claim()
    await input.handle(rows)
    claimed += rows.length
    if (rows.length < input.batchSize) {
      return claimed
    }
    if (Date.now() - startedAt > budgetMs) {
      logger.warn(
        { claimed },
        "social-post: a scan used its time budget, the rest waits for the next tick",
      )
      return claimed
    }
  }
}
