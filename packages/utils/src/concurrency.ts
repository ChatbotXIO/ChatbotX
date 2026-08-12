/**
 * Maps over `items` with `fn`, running at most `limit` invocations
 * concurrently. Returns results in the same order as `items` (like
 * `Promise.allSettled`), so it is a drop-in replacement for
 * `Promise.allSettled(items.map(fn))` when the fan-out needs a concurrency
 * cap — e.g. to stay under a third-party API's per-token rate limit.
 *
 * Per-item failures are isolated: a rejected `fn` call is captured as a
 * `{ status: "rejected" }` result rather than thrown, so one bad item never
 * aborts the others.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  if (items.length === 0) {
    return []
  }

  const boundedLimit = Math.max(1, Math.min(limit, items.length))
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let cursor = 0

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      const item = items[index] as T

      try {
        const value = await fn(item, index)
        results[index] = { status: "fulfilled", value }
      } catch (reason) {
        results[index] = { status: "rejected", reason }
      }
    }
  }

  await Promise.all(Array.from({ length: boundedLimit }, () => worker()))

  return results
}
