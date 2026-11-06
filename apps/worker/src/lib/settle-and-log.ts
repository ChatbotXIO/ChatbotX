import { mapWithConcurrency } from "@chatbotx.io/utils"

type ErrorLogger = {
  error: (context: Record<string, unknown>, message: string) => void
}

type SettleAndLogInput<T> = {
  items: readonly T[]
  concurrency: number
  /** The bounded work for one item; a rejection never stops the others. */
  run: (item: T) => Promise<unknown>
  log: ErrorLogger
  /** The log line when at least one item failed. */
  failureMessage: string
  /** Identifies the batch in the failure log. */
  logContext?: Record<string, unknown>
}

/**
 * Runs `run` over `items` with bounded concurrency, and logs once (with the
 * first reason, invariant 20) when any rejected, instead of letting a failed
 * item vanish into an unread settled result. Returns the number that failed.
 */
export async function settleAndLog<T>(
  input: SettleAndLogInput<T>,
): Promise<number> {
  const results = await mapWithConcurrency(
    input.items,
    input.concurrency,
    input.run,
  )
  const rejected = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  )
  if (rejected.length > 0) {
    input.log.error(
      { ...input.logContext, failed: rejected.length, err: rejected[0].reason },
      input.failureMessage,
    )
  }
  return rejected.length
}
