import { db, relationsFilterToSQL } from "@chatbotx.io/database/client"
import { errorLogModel } from "@chatbotx.io/database/schema"
import type { ContactModel, ErrorLogModel } from "@chatbotx.io/database/types"
import {
  getPaginationWithDefaults,
  likeContains,
  parseOrderByAsObject,
} from "@chatbotx.io/database/utils"
import type { ErrorLogRecordedPayload } from "@chatbotx.io/event-bus"
import { emit } from "@chatbotx.io/event-bus"
import { createId } from "@chatbotx.io/utils"
import {
  type ErrorLogProvider,
  errorLogProviders,
  errorLogProvidersMatchingLabel,
} from "@chatbotx.io/utils/error-log"
import { isNoRedisEnv } from "@chatbotx.io/worker-config"
import { logger } from "../logger"

type ListErrorLogsInput = {
  workspaceId: string
  page?: number | null
  perPage?: number | null
  sort?: { id: string; desc: boolean }[] | null
  keyword?: string | null
}

type ErrorLogWithContactRow = ErrorLogModel & {
  contact:
    | (ContactModel & {
        conversation: { id: string } | null
      })
    | null
}

type ListErrorLogsResult = {
  data: ErrorLogWithContactRow[]
  pageCount: number
}

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
 * `detail` is a single unbounded `text` column and the payload rides through a
 * Redis stream first. One pathological SDK error (an HTTP client that embeds
 * the full response body into `message`) would otherwise bloat both. 8KB is far
 * past any real provider message, and the stream's `maxLen` is sized against
 * this ceiling — see `packages/event-bus/src/error-log/event-bus.ts`.
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

const toEntry = (input: LogProviderErrorInput): ErrorLogRecordedPayload => ({
  // Minted here, not by the writer, so that a redelivered event re-inserts the
  // same primary key and `onConflictDoNothing` absorbs it. Without this a crash
  // between the insert and the stream ack would duplicate the row.
  id: createId(),
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
 * `getRedisConnection` sets `maxRetriesPerRequest: null` and leaves ioredis's
 * offline queue on, so a command issued while the connection is down is queued
 * indefinitely and never rejects. Every caller here is inside a `catch` and
 * awaits, so an unbounded emit would wedge the job that already failed. An
 * XADD that has not completed in this long is not going to.
 */
const EMIT_TIMEOUT_MS = 2000

const TIMED_OUT = Symbol("timed-out")

const withTimeout = async (
  promise: Promise<string> | undefined,
): Promise<string | undefined | typeof TIMED_OUT> => {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), EMIT_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

/**
 * Record a batch of third-party API failures.
 *
 * For callers that already hold many failures at once — the `message:failed`
 * event-bus handler reads up to 500 payloads per batch. Single-failure callers
 * inside a `catch` should use {@link logProviderError}.
 *
 * One event per failure, emitted concurrently: the stream batches on the *read*
 * side (`readBatchSize`), so there is no reason to chunk here, and awaiting in
 * a loop would turn one caller's 500 failures into 500 serial round trips.
 * ioredis auto-pipelines commands issued in the same tick, so this is one burst.
 *
 * **Never throws**, matching {@link logProviderError}. Reports which inputs
 * could not be written via `failedIndexes` (indexes into `inputs`) so the
 * caller can hand them back to its own retry mechanism.
 */
export const logProviderErrors = async (
  inputs: LogProviderErrorInput[],
): Promise<{ failedIndexes: number[] }> => {
  // Same escape hatch `defaultQueue` uses (`isNoRedisEnv() ? fakeQueue : …`),
  // which is what this path went through before it moved onto the event bus.
  // Without it a `next build` or a test run reaches a Redis that is not there,
  // and ioredis's offline queue holds the command until the timeout above —
  // turning every covered `catch` block into a multi-second stall.
  if (isNoRedisEnv()) {
    return { failedIndexes: [] }
  }

  const results = await Promise.allSettled(
    inputs.map((input) =>
      withTimeout(emit("error-log:recorded", toEntry(input))),
    ),
  )

  const failedIndexes: number[] = []
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      // The stream write itself failed (Redis unreachable mid-command).
      // Transient — worth handing back to the caller's retry.
      logger.warn(
        { err: result.reason },
        "logProviderErrors: failed to emit error log",
      )
      failedIndexes.push(index)
      return
    }

    if (result.value === TIMED_OUT) {
      logger.warn(
        { workspaceId: inputs[index]?.workspaceId },
        "logProviderErrors: emit timed out",
      )
      failedIndexes.push(index)
      return
    }

    // `emit` resolves to the stream id, or to `""` when the payload failed
    // `safeParse`, or returns `undefined` when routing threw synchronously.
    // See `packages/event-bus/src/index.ts`.
    if (result.value === undefined) {
      logger.warn("logProviderErrors: emit routing failed")
      failedIndexes.push(index)
      return
    }

    if (result.value === "") {
      // A schema rejection is deterministic — retrying replays the identical
      // payload forever. Reporting it would also propagate a poison message up
      // to `recordProviderErrorLog`, which turns `failedIndexes` into
      // `failedMessageIds` on the *message* bus. Drop it loudly instead.
      logger.warn(
        { workspaceId: inputs[index]?.workspaceId },
        "logProviderErrors: error log rejected by schema, dropping",
      )
    }
  })

  return { failedIndexes }
}

/**
 * Record a single third-party API failure against a workspace.
 *
 * Emits onto the `events:error-log` stream rather than writing directly, so a
 * DB hiccup never lands inside the `catch` block of the thing that already
 * failed. **Never throws** — every caller is inside a `catch`, and an
 * error-logger that escalates is worse than no logger.
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

/**
 * Record a failure whose provider is only known as a runtime string — an
 * `inbox.channel` or a `channelType` column, which are plain `text` and include
 * values (`omnichannel`) that are not real destinations.
 *
 * An unrecognised channel writes **no row** rather than a fabricated provider,
 * and does so silently: these callers sit in per-row loops that already logged
 * the underlying failure to the app logger, so a second warn per row would add
 * noise without adding information. Callers that need the unmapped value
 * surfaced (`recordProviderErrorLog`) keep their own `safeParse` and warn.
 */
export const logProviderErrorForChannel = async (
  channel: string,
  input: Omit<LogProviderErrorInput, "provider">,
): Promise<void> => {
  const provider = errorLogProviders.safeParse(channel)
  if (!provider.success) {
    return
  }
  await logProviderError({ ...input, provider: provider.data })
}

/**
 * `action` stores the provider slug (`smtp`, `meta-catalog`) while the Type
 * column renders its label ("Email", "Meta catalog"), so an `ilike` on the
 * column alone cannot match what the user is looking at. Searching the labels
 * too keeps the visible value searchable.
 */
export const listErrorLogs = async (
  input: ListErrorLogsInput,
): Promise<ListErrorLogsResult> => {
  const providersByLabel = input.keyword
    ? errorLogProvidersMatchingLabel(input.keyword)
    : []

  const where = {
    workspaceId: input.workspaceId,
    ...(input.keyword
      ? {
          OR: [
            { action: { ilike: likeContains(input.keyword) } },
            { detail: { ilike: likeContains(input.keyword) } },
            ...(providersByLabel.length > 0
              ? [{ action: { in: providersByLabel } }]
              : []),
          ],
        }
      : {}),
  }

  const pagination = getPaginationWithDefaults(input)
  const orderBy = parseOrderByAsObject(errorLogModel, input)

  const [data, totalRows] = await Promise.all([
    db.query.errorLogModel.findMany({
      where,
      ...pagination,
      orderBy,
      with: {
        contact: {
          with: {
            // `ErrorLog` stores no conversationId and gains no columns, so the
            // live-chat link target is resolved through the contact. Only `id`
            // is read, by the row's live-chat link.
            conversation: { columns: { id: true } },
          },
        },
      },
    }),
    db.$count(errorLogModel, relationsFilterToSQL(errorLogModel, where)),
  ])

  const pageCount = Math.ceil(totalRows / pagination.limit)

  return { data, pageCount }
}
