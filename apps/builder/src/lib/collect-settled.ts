import { logger } from "@/lib/log"

/**
 * Fetches `fetchFn(item)` for every item in parallel, logs (rather than
 * silently swallowing) any individual failure, and flattens the fulfilled
 * results — so one integration/account failing to fetch never hides the
 * others.
 */
export async function collectSettled<TItem, TResult>(
  items: TItem[],
  fetchFn: (item: TItem) => Promise<TResult[]>,
  logContext: (item: TItem) => Record<string, unknown>,
  logMessage: string,
): Promise<TResult[]> {
  const results = await Promise.allSettled(items.map((item) => fetchFn(item)))

  for (const [index, result] of results.entries()) {
    if (result.status === "rejected") {
      const item = items[index]
      logger.error(
        { err: result.reason, ...(item ? logContext(item) : {}) },
        logMessage,
      )
    }
  }

  return results
    .filter(
      (result): result is PromiseFulfilledResult<TResult[]> =>
        result.status === "fulfilled",
    )
    .flatMap((result) => result.value)
}
