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

/**
 * Settles with `promise`, or rejects once `timeoutMs` has passed, whichever
 * comes first. The underlying work is not cancelled: it may still finish after
 * the deadline (its late rejection is handled, never unhandled). Use it to stop
 * a hung dependency from stalling a hot path.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timed out after ${timeoutMs}ms`)),
      timeoutMs,
    )
  })
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer))
}

export type ConcurrencyLimiterOptions = {
  /** Gives up waiting for a slot; work that already started is not stopped. */
  signal?: AbortSignal
}

/** Runs `work` once a slot is free; see `createConcurrencyLimiter`. */
export type ConcurrencyLimiter = <T>(
  work: () => Promise<T>,
  options?: ConcurrencyLimiterOptions,
) => Promise<T>

/**
 * A cap on how much of one kind of work runs at once in this process, shared
 * by every caller of the returned function (e.g. downloads held in memory, so
 * concurrent jobs cannot multiply them). Callers past the cap wait in order;
 * a caller whose `signal` aborts while it waits leaves the queue and rejects
 * with the signal's reason, without taking a slot.
 */
export function createConcurrencyLimiter(limit: number): ConcurrencyLimiter {
  const maxActive = Math.max(1, limit)
  // Insertion order is the waiting order; a Set removes an aborted waiter
  // without searching for it.
  const waiting = new Set<() => void>()
  let active = 0

  /** Waits for a slot to be handed over; only called when none is free. */
  const waitForSlot = (signal: AbortSignal | undefined): Promise<void> => {
    if (signal?.aborted) {
      return Promise.reject(signal.reason)
    }
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        waiting.delete(start)
        reject(signal?.reason)
      }
      const start = () => {
        signal?.removeEventListener("abort", onAbort)
        resolve()
      }
      waiting.add(start)
      signal?.addEventListener("abort", onAbort, { once: true })
    })
  }

  // A freed slot passes straight to the next waiter, so `active` only drops
  // when nobody is waiting.
  const release = () => {
    const [next] = waiting
    if (next) {
      waiting.delete(next)
      next()
    } else {
      active -= 1
    }
  }

  return async (work, options) => {
    // A free slot is taken at once, so `work` starts in the caller's turn.
    if (active < maxActive) {
      active += 1
    } else {
      await waitForSlot(options?.signal)
    }
    try {
      return await work()
    } finally {
      release()
    }
  }
}
