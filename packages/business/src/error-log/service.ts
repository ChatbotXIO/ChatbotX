import type { ErrorLogProvider } from "@chatbotx.io/utils/error-log"
import type { ErrorLogEntry } from "@chatbotx.io/worker-config"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { logger } from "../logger"

export type LogProviderErrorInput = {
  /** Which third party failed. Written verbatim to `ErrorLog.action`. */
  provider: ErrorLogProvider
  workspaceId: string
  /** Set whenever a contact was in scope at the point of failure. */
  contactId?: string | null
  /** The thrown value: an `Error`, an `SdkException`, a `ParsedError`, anything. */
  error: unknown
  /** Overrides the status derived from `error`. */
  httpCode?: string | null
}

const numericStatus = (value: unknown): number | undefined => {
  if (typeof value !== "object" || value === null) {
    return
  }
  for (const key of ["statusCode", "httpStatusCode"] as const) {
    const candidate = Reflect.get(value, key)
    // `UNKNOWN_ERROR` uses -1 as its unknown sentinel, which must become null.
    if (typeof candidate === "number" && candidate > 0) {
      return candidate
    }
  }
  return
}

const resolveHttpCode = (input: LogProviderErrorInput): string | null => {
  if (input.httpCode !== undefined) {
    return input.httpCode
  }
  const status = numericStatus(input.error)
  return status === undefined ? null : String(status)
}

/**
 * `detail` is a single unbounded `text` column and the payload rides through
 * Redis first. One pathological SDK error (an HTTP client that embeds the full
 * response body into `message`) would otherwise bloat both. 8KB is far past
 * any real provider message.
 */
const MAX_DETAIL_LENGTH = 8192

const truncate = (value: string): string =>
  value.length > MAX_DETAIL_LENGTH ? value.slice(0, MAX_DETAIL_LENGTH) : value

const resolveMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  if (typeof error === "object" && error !== null) {
    const message = Reflect.get(error, "message")
    if (typeof message === "string" && message.length > 0) {
      return message
    }
  }
  return String(error)
}

/**
 * Entries per queued job. One job per failure would flood the shared `default`
 * queue when a burst of inbound traffic fails at once; one job for an unbounded
 * batch would push a multi-megabyte payload through Redis, since each entry can
 * carry an 8KB `detail`. 100 keeps the worst-case payload under ~1MB.
 */
export const ERROR_LOG_BATCH_SIZE = 100

const toEntry = (input: LogProviderErrorInput): ErrorLogEntry => ({
  workspaceId: input.workspaceId,
  provider: input.provider,
  contactId: input.contactId ?? undefined,
  // Only the provider's own message. `ErrorLog` is workspace-facing (the
  // builder table plus the workspace-token API), so the thrown value's stack
  // is deliberately dropped here: it leaks absolute server paths and our
  // internal call chain to end users, and adds nothing they can act on. The
  // full error, stack included, is still written to the app logger by the
  // `catch` block that calls this.
  error: {
    message: truncate(resolveMessage(input.error)),
    httpCode: resolveHttpCode(input),
  },
})

/**
 * Record a batch of third-party API failures in as few queue jobs as possible.
 *
 * For callers that already hold many failures at once — the `message:failed`
 * event-bus handler reads up to 500 payloads per batch. Single-failure callers
 * inside a `catch` should use {@link logProviderError}.
 *
 * **Never throws**, matching {@link logProviderError}. Reports which inputs
 * could not be enqueued via `failedIndexes` (indexes into `inputs`) so the
 * caller can hand them back to its own retry mechanism.
 */
export const logProviderErrors = async (
  inputs: LogProviderErrorInput[],
): Promise<{ failedIndexes: number[] }> => {
  const failedIndexes: number[] = []

  for (let start = 0; start < inputs.length; start += ERROR_LOG_BATCH_SIZE) {
    const slice = inputs.slice(start, start + ERROR_LOG_BATCH_SIZE)
    try {
      await defaultQueue.add(DefaultJobAction.sendErrorLog, {
        type: DefaultJobAction.sendErrorLog,
        data: { entries: slice.map(toEntry) },
      })
    } catch (err) {
      logger.warn(
        { err, count: slice.length },
        "logProviderErrors: failed to enqueue error logs",
      )
      failedIndexes.push(...slice.map((_, offset) => start + offset))
    }
  }

  return { failedIndexes }
}

/**
 * Record a single third-party API failure against a workspace.
 *
 * Enqueues rather than writing directly, so a DB hiccup never lands inside the
 * `catch` block of the thing that already failed. **Never throws** — every
 * caller is inside a `catch`, and an error-logger that escalates is worse than
 * no logger.
 *
 * `detail` holds the provider's message raw and unredacted by explicit product
 * decision (see the design spec's "Accepted risk" section) — but never the
 * stack; see {@link toEntry}.
 */
export const logProviderError = async (
  input: LogProviderErrorInput,
): Promise<void> => {
  await logProviderErrors([input])
}
